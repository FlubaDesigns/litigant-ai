import { Resend } from "resend";
import { getAuth } from "firebase-admin/auth";
import { isFirebaseConfigured, getFirestoreDb } from "./firebaseAdmin.js";
import { getBillingDefaults } from "./billingDefaultsConfig.js";
import {
  getTemplateConfig,
  EMAIL_TEMPLATE_META,
  EMAIL_TEMPLATE_IDS,
  interpolate,
  type EmailTemplateId,
} from "./emailTemplateStore.js";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    const key = process.env["RESEND_API_KEY"];
    if (!key) throw new Error("RESEND_API_KEY is not set");
    resend = new Resend(key);
  }
  return resend;
}

const FROM = "Litigant AI <noreply@send.litigant-ai.com>";
const APP_URL = `https://${process.env["APP_DOMAIN"] ?? "litigant-ai.com"}`;
const LOGO_URL = "https://litigant-ai.com/logo.png";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

/** Render intro text — split on blank lines so admins get multi-paragraph support. */
function renderIntro(text: string): string {
  return text
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => paragraph(escapeHtml(chunk)))
    .join("");
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function baseTemplate({
  badge,
  badgeColor = "#00c853",
  headline,
  body,
  footerExtra = "",
}: {
  badge: string;
  badgeColor?: string;
  headline: string;
  body: string;
  footerExtra?: string;
}): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Litigant AI</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:22px 36px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="${LOGO_URL}" width="34" height="34" alt="Litigant AI"
                    style="display:block;border-radius:7px;border:0;">
                </td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <span style="font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.2px;">Litigant AI</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 36px 36px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:2.5px;color:${badgeColor};text-transform:uppercase;">${badge}</p>
            <h1 style="margin:0 0 26px;font-size:26px;font-weight:700;color:#fff;line-height:1.25;letter-spacing:-0.3px;">${headline}</h1>
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 36px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;line-height:1.7;">
              &copy; ${year} Litigant AI &nbsp;&middot;&nbsp;
              <a href="${APP_URL}" style="color:#555;text-decoration:none;">litigant-ai.com</a>
              ${footerExtra ? `&nbsp;&middot;&nbsp;${footerExtra}` : ""}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string, bg = "#00c853", fg = "#000"): string {
  return `<a href="${url}" style="display:inline-block;background:${bg};color:${fg};font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;padding:13px 28px;border-radius:8px;">${text} &rarr;</a>`;
}

function btnOutline(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:transparent;color:#777;font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px;border:1px solid #2a2a2a;">${text}</a>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 22px;font-size:15px;color:#888;line-height:1.75;">${html}</p>`;
}

function callout(html: string, accent = "#00c853"): string {
  return `<div style="background:#0d0d0d;border:1px solid ${accent}28;border-left:3px solid ${accent};border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 28px;">
  <p style="margin:0;font-size:13px;color:#888;line-height:1.65;">${html}</p>
</div>`;
}

function infoTable(rows: { label: string; value: string; color?: string }[]): string {
  const cells = rows.map(({ label, value, color = "#fff" }, i) => {
    const last = i === rows.length - 1;
    const border = last ? "" : "border-bottom:1px solid #1a1a1a;";
    return `<tr>
      <td style="padding:16px 22px;${border}">
        <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
          <tr>
            <td style="font-size:12px;color:#555;">${label}</td>
            <td align="right" style="font-size:15px;font-weight:600;color:${color};">${value}</td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join("");
  return `<table cellpadding="0" cellspacing="0" role="presentation"
    style="width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;margin:0 0 28px;">${cells}</table>`;
}

function featureList(items: { label: string; desc: string }[]): string {
  const rows = items.map(({ label, desc }, i) => {
    const last = i === items.length - 1;
    const border = last ? "" : "border-bottom:1px solid #1a1a1a;";
    return `<tr>
      <td style="padding:16px 22px;${border}">
        <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">${label}</p>
        <p style="margin:0;font-size:13px;color:#888;">${desc}</p>
      </td>
    </tr>`;
  }).join("");
  return `<table cellpadding="0" cellspacing="0" role="presentation"
    style="width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;margin:0 0 28px;">${rows}</table>`;
}

function ctaRow(primary: { text: string; url: string; bg?: string; fg?: string }, secondary?: { text: string; url: string }): string {
  const primaryBtn = btn(primary.text, primary.url, primary.bg, primary.fg);
  if (!secondary) return primaryBtn;
  return `<table cellpadding="0" cellspacing="0" role="presentation"><tr>
    <td style="padding-right:12px;">${primaryBtn}</td>
    <td>${btnOutline(secondary.text, secondary.url)}</td>
  </tr></table>`;
}

// ── Template renderers ────────────────────────────────────────────────────────
// Each accepts `intro` — the resolved (interpolated) intro paragraph text.

function verificationTemplate(link: string, intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.verification.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${btn("Verify my email", link)}
      <p style="margin:24px 0 0;font-size:12px;color:#555;line-height:1.65;">
        If you didn't create this account, ignore this email — nothing has changed.<br>
        <span style="word-break:break-all;color:#444;">Or copy this link: ${link}</span>
      </p>
    `,
    footerExtra: "You received this because an account was created with your email address.",
  });
}

function passwordResetTemplate(link: string, intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.passwordReset.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${btn("Reset my password", link)}
      ${callout("If you didn't request this, your account is safe — no changes have been made.")}
      <p style="margin:0;font-size:12px;color:#555;">This link expires in 1 hour.</p>
    `,
    footerExtra: "You received this because a password reset was requested for your account.",
  });
}

function welcomeTemplate(intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.welcome.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${featureList([
        { label: "Run a session", desc: "Submit any legal question and watch both sides argued end-to-end." },
        { label: "Rebuttal rounds", desc: "Challenge any answer to trigger a full rebuttal — stress-test your position." },
        { label: "Top up anytime", desc: "Credits never expire. Add more whenever you need them." },
      ])}
      ${ctaRow({ text: "Open dashboard", url: `${APP_URL}/app` }, { text: "Top up", url: `${APP_URL}/billing` })}
    `,
  });
}

function lowCreditsTemplate(intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.lowCredits.badgeText,
    badgeColor: EMAIL_TEMPLATE_META.lowCredits.badgeColor,
    headline,
    body: `
      ${renderIntro(intro)}
      ${callout("Credits never expire once added — load any amount and use them at your own pace.", "#f59e0b")}
      ${btn("Top up credits", `${APP_URL}/billing`, "#f59e0b", "#000")}
    `,
    footerExtra: "You received this because your balance crossed your configured alert threshold.",
  });
}

function sessionCompleteTemplate(
  sessionId: string,
  sessionTitle: string,
  creditsUsed: number,
  intro: string,
  headline: string
): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.sessionComplete.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${infoTable([
        { label: "Session", value: sessionTitle },
        { label: "Credits used", value: creditsUsed.toLocaleString(), color: "#888" },
      ])}
      ${btn("View results", `${APP_URL}/app/session/${sessionId}`)}
    `,
    footerExtra: `Disable in your <a href="${APP_URL}/settings" style="color:#555;text-decoration:none;">account settings</a>.`,
  });
}

function paymentReceiptTemplate(
  creditsAdded: number,
  amountPaid: string,
  newBalance: number,
  intro: string,
  headline: string
): string {
  const now = new Date().toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.paymentReceipt.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${infoTable([
        { label: "Amount charged", value: amountPaid },
        { label: "Credits added", value: `+${creditsAdded.toLocaleString()}`, color: "#00c853" },
        { label: "New balance", value: `${newBalance.toLocaleString()} credits` },
        { label: "Date", value: now, color: "#888" },
      ])}
      ${btn("Start a session", `${APP_URL}/app`)}
    `,
    footerExtra: "Keep this email as your purchase receipt.",
  });
}

function autoRefillTriggeredTemplate(
  balance: number,
  topUpUrl: string,
  dollarAmount: number,
  intro: string,
  headline: string
): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.autoRefillTriggered.badgeText,
    badgeColor: EMAIL_TEMPLATE_META.autoRefillTriggered.badgeColor,
    headline,
    body: `
      ${renderIntro(intro)}
      ${callout("This checkout link is unique to your account and expires after 24 hours.", "#f59e0b")}
      ${ctaRow(
        { text: "Complete top-up", url: topUpUrl, bg: "#f59e0b", fg: "#000" },
        { text: "Manage billing", url: `${APP_URL}/billing` }
      )}
    `,
    footerExtra: "You received this because your balance crossed your auto top-up threshold.",
  });
}

function accountSuspendedTemplate(reason: string | undefined, intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.accountSuspended.badgeText,
    badgeColor: EMAIL_TEMPLATE_META.accountSuspended.badgeColor,
    headline,
    body: `
      ${renderIntro(intro)}
      ${reason ? infoTable([{ label: "Reason on file", value: escapeHtml(reason), color: "#888" }]) : ""}
      ${btn("Contact support", "mailto:support@litigant-ai.com", "#ef4444", "#fff")}
    `,
    footerExtra: "This notice was sent to the email address associated with your account.",
  });
}

function reengagementTemplate(creditBalance: number, intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.reengagement.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${featureList([
        { label: "Case analysis", desc: "Submit a brief or case summary and get both sides argued in full." },
        { label: "Strategy review", desc: "Test your arguments before filing — find the weak points first." },
        { label: "Legal research", desc: "Rapid reasoning on any question, jurisdiction, or doctrine." },
      ])}
      ${btn("Return to dashboard", `${APP_URL}/app`)}
    `,
    footerExtra: `<a href="${APP_URL}/settings" style="color:#444;text-decoration:none;">Unsubscribe from re-engagement emails</a>`,
  });
}

function firstSessionTemplate(
  sessionId: string,
  sessionTitle: string,
  intro: string,
  headline: string
): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.firstSession.badgeText,
    headline,
    body: `
      ${renderIntro(intro)}
      ${infoTable([{ label: "Session", value: sessionTitle }])}
      ${featureList([
        { label: "Rebuttal rounds", desc: "Challenge any answer from inside a session to trigger a full rebuttal — great for stress-testing arguments." },
        { label: "Session history", desc: "Every session is saved. Review, share, or export transcripts any time from your dashboard." },
      ])}
      ${ctaRow(
        { text: "View my results", url: `${APP_URL}/app/session/${sessionId}` },
        { text: "Back to dashboard", url: `${APP_URL}/app` }
      )}
    `,
  });
}

function zeroCreditsTemplate(intro: string, headline: string): string {
  return baseTemplate({
    badge: EMAIL_TEMPLATE_META.zeroCredits.badgeText,
    badgeColor: EMAIL_TEMPLATE_META.zeroCredits.badgeColor,
    headline,
    body: `
      ${renderIntro(intro)}
      ${callout("Credits never expire once added — top up any amount and start again immediately.", "#ef4444")}
      ${ctaRow(
        { text: "Top up now", url: `${APP_URL}/billing`, bg: "#ef4444", fg: "#fff" },
        { text: "View plans", url: `${APP_URL}/billing` }
      )}
    `,
    footerExtra: "You received this because your credit balance reached zero.",
  });
}

// ── Preview helper (used by admin preview endpoint) ───────────────────────────

const SAMPLE_VARS: Record<EmailTemplateId, Record<string, string | number>> = {
  verification:        { name: "Alex", bonusCredits: 500 },
  passwordReset:       { name: "Alex" },
  welcome:             { name: "Alex" },
  lowCredits:          { name: "Alex", balance: 42, threshold: 100 },
  sessionComplete:     { name: "Alex", credits: 120 },
  paymentReceipt:      { name: "Alex", credits: 500 },
  autoRefillTriggered: { name: "Alex", balance: 45, amount: 20 },
  accountSuspended:    { name: "Alex" },
  reengagement:        { name: "Alex", credits: 350 },
  firstSession:        { name: "Alex" },
  zeroCredits:         { name: "Alex" },
};

export function renderTemplatePreview(id: EmailTemplateId, overrides?: {
  subject?: string; headline?: string; introText?: string;
}): string {
  const meta = EMAIL_TEMPLATE_META[id];
  const sampleVars = SAMPLE_VARS[id];
  const rawHeadline = overrides?.headline ?? meta.defaultHeadline;
  const rawIntro    = overrides?.introText ?? meta.defaultIntroText;
  const headline    = escapeHtml(interpolate(rawHeadline, sampleVars));
  const intro       = interpolate(rawIntro, sampleVars);

  switch (id) {
    case "verification":
      return verificationTemplate(`${APP_URL}/verify?token=PREVIEW`, intro, headline);
    case "passwordReset":
      return passwordResetTemplate(`${APP_URL}/reset?token=PREVIEW`, intro, headline);
    case "welcome":
      return welcomeTemplate(intro, headline);
    case "lowCredits":
      return lowCreditsTemplate(intro, headline);
    case "sessionComplete":
      return sessionCompleteTemplate("previewSessionId", "Sample legal query preview", 120, intro, headline);
    case "paymentReceipt":
      return paymentReceiptTemplate(500, "$25.00", 850, intro, headline);
    case "autoRefillTriggered":
      return autoRefillTriggeredTemplate(45, `${APP_URL}/billing`, 20, intro, headline);
    case "accountSuspended":
      return accountSuspendedTemplate("Violation of terms of service", intro, headline);
    case "reengagement":
      return reengagementTemplate(350, intro, headline);
    case "firstSession":
      return firstSessionTemplate("previewSessionId", "Sample legal query preview", intro, headline);
    case "zeroCredits":
      return zeroCreditsTemplate(intro, headline);
  }
}

// ── Resolve + guard helper ────────────────────────────────────────────────────

async function resolveTemplate(id: EmailTemplateId, vars: Record<string, string | number>): Promise<{
  enabled: boolean;
  subject: string;
  headline: string;
  intro: string;
}> {
  const meta   = EMAIL_TEMPLATE_META[id];
  const config = await getTemplateConfig(id);
  const subject  = interpolate(config.subject  ?? meta.defaultSubject,  vars);
  const headline = interpolate(config.headline ?? meta.defaultHeadline, vars);
  const intro    = interpolate(config.introText ?? meta.defaultIntroText, vars);
  return { enabled: config.enabled, subject, headline, intro };
}

// ── Public send functions ─────────────────────────────────────────────────────

export async function sendVerificationEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const [user, billing] = await Promise.all([getAuth().getUser(uid), getBillingDefaults()]);
  const link = await getAuth().generateEmailVerificationLink(user.email!, { url: `${APP_URL}/login?verified=1` });
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("verification", {
    name, bonusCredits: billing.signupBonusCredits,
  });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: verificationTemplate(link, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const link = await getAuth().generatePasswordResetLink(email, { url: `${APP_URL}/login?reset=1` });
  let name = "there";
  try { name = (await getAuth().getUserByEmail(email)).displayName ?? name; } catch { /* ok */ }
  const { enabled, subject, headline, intro } = await resolveTemplate("passwordReset", { name });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: email, subject,
    html: passwordResetTemplate(link, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendWelcomeEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("welcome", { name });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: welcomeTemplate(intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendLowCreditsEmail(uid: string, balance: number, threshold: number): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("lowCredits", {
    name, balance: balance.toLocaleString(), threshold: threshold.toLocaleString(),
  });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: lowCreditsTemplate(intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendSessionCompleteEmail(
  uid: string, sessionId: string, title: string, creditsUsed: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("sessionComplete", { name });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: sessionCompleteTemplate(sessionId, title, creditsUsed, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendPaymentReceiptEmail(
  uid: string, creditsAdded: number, amountPaidCents: number, newBalance: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("paymentReceipt", {
    name, credits: creditsAdded.toLocaleString(),
  });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: paymentReceiptTemplate(creditsAdded, `$${(amountPaidCents / 100).toFixed(2)}`, newBalance, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendAutoRefillTriggeredEmail(
  uid: string, balance: number, topUpUrl: string, dollarAmount: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("autoRefillTriggered", {
    name, balance: balance.toLocaleString(), amount: dollarAmount,
  });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: autoRefillTriggeredTemplate(balance, topUpUrl, dollarAmount, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendAccountSuspendedEmail(uid: string, reason?: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  if (!user.email) return;
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("accountSuspended", { name });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email, subject,
    html: accountSuspendedTemplate(reason, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendReengagementEmail(uid: string, creditBalance: number): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  if (!user.email) return;
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("reengagement", {
    name, credits: creditBalance.toLocaleString(),
  });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email, subject,
    html: reengagementTemplate(creditBalance, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendFirstSessionEmail(
  uid: string, sessionId: string, title: string
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("firstSession", { name });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: firstSessionTemplate(sessionId, title, intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendZeroCreditsEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const name = user.displayName ?? "there";
  const { enabled, subject, headline, intro } = await resolveTemplate("zeroCredits", { name });
  if (!enabled) return;
  const { error } = await getResend().emails.send({
    from: FROM, to: user.email!, subject,
    html: zeroCreditsTemplate(intro, headline),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

/**
 * Re-engagement campaign — queries Firestore for users with credits who
 * haven't had a session in `inactiveDays` days, and haven't been re-engaged
 * in that same window.  Returns the number of emails successfully sent.
 */
export async function runReengagementCampaign(inactiveDays = 14): Promise<number> {
  if (!isFirebaseConfigured()) return 0;
  const db = getFirestoreDb();
  if (!db) return 0;

  const cutoffMs = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
  const snap = await db.collection("users").where("creditBalance", ">", 0).get();
  let sent = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data["banned"]) continue;
    if ((data["lastSessionAt"] as number | undefined ?? 0) > cutoffMs) continue;
    if ((data["reengagementEmailSentAt"] as number | undefined ?? 0) > cutoffMs) continue;

    try {
      await sendReengagementEmail(doc.id, data["creditBalance"] as number);
      await doc.ref.update({ reengagementEmailSentAt: Date.now() });
      sent++;
    } catch (e: any) {
      console.error(`[Reengagement] uid=${doc.id}: ${e.message}`);
    }
  }
  return sent;
}

export function isResendConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}
