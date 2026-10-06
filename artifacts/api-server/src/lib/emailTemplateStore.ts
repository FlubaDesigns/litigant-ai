/**
 * emailTemplateStore.ts
 *
 * Manages per-template overrides stored in Firestore:
 *   email_templates/{templateId}           ← active config (subject, headline, introText, enabled)
 *   email_templates/{templateId}/versions  ← saved version snapshots
 *
 * Every send function reads from this store first.  Defaults fall back to the
 * code-level values defined in EMAIL_TEMPLATE_META. Each read observes the
 * saved config, including changes made through another server instance.
 */

import { getFirestoreDb, isFirebaseConfigured } from "./firebaseAdmin.js";

// ── Template ID registry ──────────────────────────────────────────────────────

export const EMAIL_TEMPLATE_IDS = [
  "verification",
  "passwordReset",
  "welcome",
  "lowCredits",
  "sessionComplete",
  "paymentReceipt",
  "accountSuspended",
  "reengagement",
  "firstSession",
  "zeroCredits",
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

// ── Template metadata ─────────────────────────────────────────────────────────

export interface EmailTemplateMeta {
  label: string;
  trigger: string;
  badgeText: string;
  badgeColor: string;
  defaultSubject: string;
  defaultHeadline: string;
  defaultIntroText: string;
  /** Variables available for interpolation in subject / headline / introText */
  tokens: string[];
  /** If false, the enabled toggle is hidden and the email always fires */
  canDisable: boolean;
}

export const EMAIL_TEMPLATE_META: Record<EmailTemplateId, EmailTemplateMeta> = {
  verification: {
    label: "Email verification",
    trigger: "On signup — automatic",
    badgeText: "Email Verification",
    badgeColor: "#00c853",
    defaultSubject: "Verify your Litigant AI access",
    defaultHeadline: "Verify your access, {name}.",
    defaultIntroText:
      "A verification request was initiated for your Litigant AI account. Confirm your email to activate full access and unlock your {bonusCredits} free credits.",
    tokens: ["name", "bonusCredits"],
    canDisable: false,
  },
  passwordReset: {
    label: "Password reset",
    trigger: "When user submits Forgot Password (rate-limited 3/hr)",
    badgeText: "Security",
    badgeColor: "#00c853",
    defaultSubject: "Reset your Litigant AI password",
    defaultHeadline: "Password reset requested.",
    defaultIntroText:
      "Hi {name}, a password reset was requested for your Litigant AI account. Click below to choose a new password — the link expires in one hour.",
    tokens: ["name"],
    canDisable: false,
  },
  welcome: {
    label: "Welcome",
    trigger: "Once, when user completes email verification",
    badgeText: "Access Granted",
    badgeColor: "#00c853",
    defaultSubject: "Welcome to Litigant AI — you're in",
    defaultHeadline: "Welcome aboard, {name}.",
    defaultIntroText:
      "Your account is live, your credits are loaded, and the engine is ready. We built Litigant AI to help you think through every angle of a legal question — start with anything you're working on.",
    tokens: ["name"],
    canDisable: true,
  },
  lowCredits: {
    label: "Low-credits warning",
    trigger: "Balance drops below alert threshold — max once per 24 hours",
    badgeText: "Credit Alert",
    badgeColor: "#f59e0b",
    defaultSubject: "Credit alert — {balance} credits remaining",
    defaultHeadline: "Running low, {name}.",
    defaultIntroText:
      "You're making good use of Litigant AI — just a heads up that your balance has dropped to {balance} credits, below your alert threshold of {threshold}. Top up any time to keep your sessions running without interruption.",
    tokens: ["name", "balance", "threshold"],
    canDisable: true,
  },
  sessionComplete: {
    label: "Session complete",
    trigger: "After each session — only for users who opt in",
    badgeText: "Analysis Complete",
    badgeColor: "#00c853",
    defaultSubject: "Your analysis is ready",
    defaultHeadline: "Your session is ready.",
    defaultIntroText:
      "Hey {name}, the adversarial reasoning engine has finished analysing your query. Both sides have been argued in full — your results are waiting below.",
    tokens: ["name"],
    canDisable: true,
  },
  paymentReceipt: {
    label: "Payment receipt",
    trigger: "When a Square payment completes (non-duplicate)",
    badgeText: "Payment Confirmed",
    badgeColor: "#00c853",
    defaultSubject: "Receipt — {credits} credits added",
    defaultHeadline: "Credits loaded, {name}.",
    defaultIntroText:
      "Your payment went through and your credits are ready to use. Here's a summary of your purchase.",
    tokens: ["name", "credits"],
    canDisable: false,
  },
  accountSuspended: {
    label: "Account suspended",
    trigger: "When an admin bans a user account",
    badgeText: "Account Notice",
    badgeColor: "#ef4444",
    defaultSubject: "Your Litigant AI account has been suspended",
    defaultHeadline: "Your account has been suspended.",
    defaultIntroText:
      "Hi {name}, your Litigant AI account has been suspended and you will not be able to sign in. If you believe this is a mistake, please reach out to our support team and we'll review your account.",
    tokens: ["name"],
    canDisable: true,
  },
  reengagement: {
    label: "Re-engagement",
    trigger: "Manual campaign — users with credits inactive 14+ days",
    badgeText: "We Miss You",
    badgeColor: "#00c853",
    defaultSubject: "You have {credits} credits waiting, {name}",
    defaultHeadline: "Still here for you, {name}.",
    defaultIntroText:
      "We've kept your credits warm. You have {credits} waiting in your account — whenever you're ready, the adversarial reasoning engine is here to help you think through anything.",
    tokens: ["name", "credits"],
    canDisable: true,
  },
  firstSession: {
    label: "First session milestone",
    trigger: "After user's very first completed session — fires exactly once",
    badgeText: "First Session Complete",
    badgeColor: "#00c853",
    defaultSubject: "Your first session is ready",
    defaultHeadline: "You just ran your first session.",
    defaultIntroText:
      "You did it, {name}. The adversarial reasoning engine has processed your first query — both sides of your question have been argued in full. Your results are waiting, and there's a lot more where that came from.",
    tokens: ["name"],
    canDisable: true,
  },
  zeroCredits: {
    label: "Zero credits",
    trigger: "Balance hits 0 after a session — max once per 24 hours",
    badgeText: "Out of Credits",
    badgeColor: "#ef4444",
    defaultSubject: "You're out of credits — top up to continue",
    defaultHeadline: "You're out of credits, {name}.",
    defaultIntroText:
      "Your balance has hit zero, {name}. You won't be able to start new sessions until you top up — but the moment you do, you'll pick up right where you left off. Credits never expire.",
    tokens: ["name"],
    canDisable: true,
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailTemplateConfig {
  id: EmailTemplateId;
  enabled: boolean;
  subject?: string;
  headline?: string;
  introText?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface EmailTemplateVersion {
  id: string;
  templateId: EmailTemplateId;
  versionName: string;
  subject: string;
  headline: string;
  introText: string;
  createdAt: number;
  createdBy: string;
}

export type EmailTemplateContent = { subject?: string; headline?: string; introText?: string };

/** Validate the same variable contract on edits, versions, previews and sends. */
export function validateTemplateContent(id: EmailTemplateId, content: EmailTemplateContent): void {
  for (const [field, max] of [["subject", 200], ["headline", 200], ["introText", 3000]] as const) {
    const value = content[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > max) throw new Error(`${field} must be text of at most ${max} characters`);
    for (const match of value.matchAll(/\{(\w+)\}/g)) {
      if (!EMAIL_TEMPLATE_META[id].tokens.includes(match[1])) throw new Error(`Unsupported variable {${match[1]}} for this email`);
    }
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getTemplateConfig(id: EmailTemplateId): Promise<EmailTemplateConfig> {
  const fallback: EmailTemplateConfig = { id, enabled: true };

  if (!isFirebaseConfigured()) throw new Error("Email settings unavailable");
  const db = getFirestoreDb();
  if (!db) throw new Error("Email settings unavailable");

  try {
    const snap = await db.collection("email_templates").doc(id).get();
    if (!snap.exists) {
      return fallback;
    }
    const d = snap.data()!;
    const config: EmailTemplateConfig = {
      id,
      enabled: !EMAIL_TEMPLATE_META[id].canDisable || d["enabled"] !== false,
      subject: d["subject"] as string | undefined,
      headline: d["headline"] as string | undefined,
      introText: d["introText"] as string | undefined,
      updatedAt: d["updatedAt"] as number | undefined,
      updatedBy: d["updatedBy"] as string | undefined,
    };
    return config;
  } catch {
    throw new Error("Email settings could not be loaded. No email was sent.");
  }
}

export async function saveTemplateConfig(
  id: EmailTemplateId,
  updates: Partial<Omit<EmailTemplateConfig, "id">>,
  updatedBy: string
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore unavailable");
  validateTemplateContent(id, updates);
  if (updates.enabled === false && !EMAIL_TEMPLATE_META[id].canDisable) throw new Error("This account email cannot be disabled");
  await db.collection("email_templates").doc(id).set(
    { ...updates, updatedAt: Date.now(), updatedBy },
    { merge: true }
  );
}

export async function listTemplateVersions(id: EmailTemplateId): Promise<EmailTemplateVersion[]> {
  if (!isFirebaseConfigured()) return [];
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db
    .collection("email_templates")
    .doc(id)
    .collection("versions")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    templateId: id,
    versionName: doc.data()["versionName"] as string,
    subject: doc.data()["subject"] as string,
    headline: doc.data()["headline"] as string,
    introText: doc.data()["introText"] as string,
    createdAt: doc.data()["createdAt"] as number,
    createdBy: doc.data()["createdBy"] as string,
  }));
}

export async function saveTemplateVersion(
  id: EmailTemplateId,
  versionName: string,
  createdBy: string,
  draft?: EmailTemplateContent
): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore unavailable");
  const meta = EMAIL_TEMPLATE_META[id];
  const config = draft ?? await getTemplateConfig(id);
  validateTemplateContent(id, config);
  const ref = await db
    .collection("email_templates")
    .doc(id)
    .collection("versions")
    .add({
      templateId: id,
      versionName,
      subject: config.subject ?? meta.defaultSubject,
      headline: config.headline ?? meta.defaultHeadline,
      introText: config.introText ?? meta.defaultIntroText,
      createdAt: Date.now(),
      createdBy,
    });
  return ref.id;
}

export async function activateTemplateVersion(
  id: EmailTemplateId,
  versionId: string,
  activatedBy: string
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore unavailable");
  const snap = await db.collection("email_templates").doc(id).collection("versions").doc(versionId).get();
  if (!snap.exists) throw new Error("Version not found");
  const d = snap.data()!;
  await saveTemplateConfig(
    id,
    {
      subject: d["subject"] as string,
      headline: d["headline"] as string,
      introText: d["introText"] as string,
    },
    activatedBy
  );
}

export async function deleteTemplateVersion(id: EmailTemplateId, versionId: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore unavailable");
  await db.collection("email_templates").doc(id).collection("versions").doc(versionId).delete();
}

/** Replace {token} placeholders with actual values. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : (() => { throw new Error(`Missing email variable {${key}}`); })()
  );
}
