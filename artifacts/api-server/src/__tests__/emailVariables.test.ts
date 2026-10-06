import { beforeEach, describe, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn(async () => ({ error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({
  getUser: async () => ({ email: "test@example.test", displayName: "Alex & Pat <Friends>" }),
  getUserByEmail: async () => ({ displayName: "Alex & Pat <Friends>" }),
  generateEmailVerificationLink: async () => "https://example.test/verify?token=fixture",
  generatePasswordResetLink: async () => "https://example.test/reset?token=fixture",
}) }));
vi.mock("../lib/firebaseAdmin.js", () => ({ isFirebaseConfigured: () => true, getFirestoreDb: vi.fn() }));
vi.mock("../lib/billingDefaultsConfig.js", () => ({ getBillingDefaults: async () => ({ signupBonusCredits: 237, emailCreditWarningThreshold: 81 }) }));
vi.mock("../lib/emailTemplateStore.js", async original => ({
  ...await original<typeof import("../lib/emailTemplateStore.js")>(), getTemplateConfig: vi.fn(),
}));
import { EMAIL_TEMPLATE_IDS, EMAIL_TEMPLATE_META, getTemplateConfig, validateTemplateContent, type EmailTemplateId } from "../lib/emailTemplateStore.js";
import * as email from "../lib/emailService.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-fixture-only");
  vi.mocked(getTemplateConfig).mockImplementation(async id => {
    const allTokens = EMAIL_TEMPLATE_META[id].tokens.map(token => `{${token}}`).join(" | ");
    return { id, enabled: true, subject: allTokens, headline: allTokens, introText: allTokens };
  });
});

const senders: Record<EmailTemplateId, () => Promise<boolean>> = {
  verification: () => email.sendVerificationEmail("fixture"),
  passwordReset: () => email.sendPasswordResetEmail("test@example.test"),
  welcome: () => email.sendWelcomeEmail("fixture"),
  lowCredits: () => email.sendLowCreditsEmail("fixture", 42, 81),
  sessionComplete: () => email.sendSessionCompleteEmail("fixture", "session", "A supplied title", 120),
  paymentReceipt: () => email.sendPaymentReceiptEmail("fixture", 1250, 2500, 1300),
  autoRefillTriggered: () => email.sendAutoRefillTriggeredEmail("fixture", 45, "https://example.test/pay", 20),
  accountSuspended: () => email.sendAccountSuspendedEmail("fixture", "A supplied reason"),
  reengagement: () => email.sendReengagementEmail("fixture", 350),
  firstSession: () => email.sendFirstSessionEmail("fixture", "session", "A supplied title"),
  zeroCredits: () => email.sendZeroCreditsEmail("fixture"),
};

describe("email variable wiring", () => {
  it.each(EMAIL_TEMPLATE_IDS)("substitutes every advertised %s variable in actual send content", async id => {
    await senders[id]();
    expect(send).toHaveBeenCalledTimes(1);
    const sent = (send.mock.calls[0] as any)[0];
    expect(sent.subject).not.toMatch(/\{\w+\}/);
    expect(sent.html).not.toMatch(/\{\w+\}/);
    expect(sent.subject).toContain("Alex & Pat <Friends>");
    expect(sent.html).toContain("Alex &amp; Pat &lt;Friends&gt;");
    expect(sent.html).not.toContain("&amp;amp;");
    const expected: Partial<Record<EmailTemplateId, string[]>> = {
      verification: ["237"], lowCredits: ["42", "81"], paymentReceipt: ["1,250"],
      autoRefillTriggered: ["45", "20"], reengagement: ["350"],
    };
    for (const value of expected[id] ?? []) expect(sent.subject).toContain(value);
  });

  it.each(EMAIL_TEMPLATE_IDS)("substitutes %s preview draft and subject without sending", async id => {
    const tokens = EMAIL_TEMPLATE_META[id].tokens.map(token => `{${token}}`).join(" | ");
    const html = await email.renderTemplatePreview(id, { subject: `Draft ${tokens}`, headline: `Draft headline ${tokens}`, introText: `Draft body ${tokens}` });
    expect(html).toContain("Subject: Draft Alex");
    expect(html).toContain("Draft headline Alex");
    expect(html).toContain("Draft body Alex");
    expect(html).not.toMatch(/\{\w+\}/);
    if (id === "verification") expect(html).toContain("237");
    if (id === "lowCredits") expect(html).toContain("81");
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects unsupported variables and prevents unresolved variables from being sent", async () => {
    expect(() => validateTemplateContent("welcome", { introText: "Hello {displayName}" })).toThrow("Unsupported variable {displayName}");
    expect(() => email.resolveTemplateContent("verification", {}, { name: "Alex" })).toThrow("Missing email variable {bonusCredits}");
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps mandatory account emails enabled even if an old saved config disabled them", async () => {
    vi.mocked(getTemplateConfig).mockImplementation(async id => ({ id, enabled: false }));
    await email.sendVerificationEmail("fixture");
    await email.sendPasswordResetEmail("test@example.test");
    await email.sendPaymentReceiptEmail("fixture", 500, 2500, 500);
    await email.sendWelcomeEmail("fixture");
    expect(send).toHaveBeenCalledTimes(3);
  });
});
