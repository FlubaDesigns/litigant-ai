import { Resend } from "resend";
import { getAuth } from "firebase-admin/auth";
import { isFirebaseConfigured, getFirestoreDb } from "./firebaseAdmin.js";
import { getBillingDefaults } from "./billingDefaultsConfig.js";

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

/**
 * Escapes the five HTML-significant characters before interpolating
 * user-controlled text into email HTML.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

// ── Shared layout primitives ──────────────────────────────────────────────────

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
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:26px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;vertical-align:middle;"></td>
                <td style="padding-left:10px;font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.2px;vertical-align:middle;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 36px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:2.5px;color:${badgeColor};text-transform:uppercase;">${badge}</p>
            <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;color:#fff;line-height:1.25;letter-spacing:-0.3px;">${headline}</h1>
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;line-height:1.6;">
              &copy; ${year} Litigant AI &nbsp;&middot;&nbsp;
              <a href="${APP_URL}" style="color:#555;text-decoration:none;">litigant-ai.com</a>
              ${footerExtra ? `&nbsp;&middot;&nbsp; ${footerExtra}` : ""}
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
  return `<a href="${url}" style="display:inline-block;background:${bg};color:${fg};font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;padding:13px 30px;border-radius:8px;">${text} &rarr;</a>`;
}

function btnOutline(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:transparent;color:#777;font-size:14px;font-weight:600;letter-spacing:0.3px;text-decoration:none;padding:13px 30px;border-radius:8px;border:1px solid #2a2a2a;">${text}</a>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 22px;font-size:15px;color:#888;line-height:1.7;">${html}</p>`;
}

function callout(html: string, accentColor = "#00c853"): string {
  return `<div style="background:#0d0d0d;border:1px solid ${accentColor}30;border-left:3px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 28px;">
  <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">${html}</p>
</div>`;
}

function infoTable(rows: { label: string; value: string; color?: string }[]): string {
  const cells = rows.map(({ label, value, color = "#fff" }, i) => {
    const isLast = i === rows.length - 1;
    return `<tr>
      <td style="padding:16px 22px;${isLast ? "" : "border-bottom:1px solid #1a1a1a;"}">
        <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
          <tr>
            <td style="font-size:12px;color:#555;">${label}</td>
            <td align="right" style="font-size:15px;font-weight:600;color:${color};">${value}</td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join("");
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;margin:0 0 28px;">${cells}</table>`;
}

// ── 1. Email verification ─────────────────────────────────────────────────────

function verificationTemplate(link: string, name: string, bonusCredits: number): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "Email Verification",
    headline: `Verify your access,<br>${safeName}.`,
    body: `
      ${paragraph(`A verification request was initiated for your Litigant AI account. Confirm your email to activate full access and unlock your <strong style="color:#fff;">${bonusCredits} free credits</strong>.`)}
      ${btn(link ? "Verify my email" : "Verify my email", link)}
      <p style="margin:24px 0 0;font-size:12px;color:#555;line-height:1.6;">
        If you didn't create this account, you can safely ignore this email. This link expires in 24 hours.<br>
        <span style="word-break:break-all;color:#444;">Or copy: ${link}</span>
      </p>
    `,
    footerExtra: "You received this because an account was created with your email address.",
  });
}

// ── 2. Password reset ─────────────────────────────────────────────────────────

function passwordResetTemplate(link: string, name: string): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "Security",
    headline: "Password reset<br>requested.",
    body: `
      ${paragraph(`Hi ${safeName}, a password reset was requested for your Litigant AI account. Click below to choose a new password.`)}
      ${btn(link ? "Reset my password" : "Reset my password", link)}
      ${callout("If you didn't request this, your account is safe — you can ignore this email. No changes have been made.")}
      <p style="margin:0;font-size:12px;color:#555;">This link expires in 1 hour.</p>
    `,
    footerExtra: "You received this because a password reset was requested for your account.",
  });
}

// ── 3. Welcome (post-verification) ───────────────────────────────────────────

function welcomeTemplate(name: string): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "Access Granted",
    headline: `Welcome aboard,<br>${safeName}.`,
    body: `
      ${paragraph("Your account is verified and your credits are loaded. You're all set to put the adversarial reasoning engine to work.")}
      <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;margin:0 0 28px;">
        <tr>
          <td style="padding:18px 22px;border-bottom:1px solid #1a1a1a;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Run a session</p>
            <p style="margin:0;font-size:13px;color:#888;">Submit a legal question and watch both sides argue it out.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 22px;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Top up credits</p>
            <p style="margin:0;font-size:13px;color:#888;">Credits never expire — add more whenever you need them.</p>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;">${btn("Open dashboard", `${APP_URL}/app`)}</td>
        <td>${btnOutline("Top up", `${APP_URL}/billing`)}</td>
      </tr></table>
    `,
  });
}

// ── 4. Low-credits warning ────────────────────────────────────────────────────

function lowCreditsTemplate(name: string, balance: number, threshold: number): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "Credit Alert",
    badgeColor: "#f59e0b",
    headline: `Running low,<br>${safeName}.`,
    body: `
      ${paragraph(`Your balance has dropped to <strong style="color:#f59e0b;">${balance.toLocaleString()} credits</strong> — below your alert threshold of ${threshold.toLocaleString()}. Top up to keep your sessions running without interruption.`)}
      ${callout("Credits never expire — add them any time and use them at your own pace.", "#f59e0b")}
      ${btn("Top up credits", `${APP_URL}/billing`, "#f59e0b", "#000")}
    `,
    footerExtra: "You received this because your balance crossed your configured alert threshold.",
  });
}

// ── 5. Session complete ───────────────────────────────────────────────────────

function sessionCompleteTemplate(name: string, sessionTitle: string, creditsUsed: number, sessionUrl: string): string {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(sessionTitle);
  return baseTemplate({
    badge: "Analysis Complete",
    headline: "Your session<br>is ready.",
    body: `
      ${paragraph(`Hey ${safeName}, the adversarial reasoning engine has finished analysing your query.`)}
      ${infoTable([
        { label: "Session", value: safeTitle },
        { label: "Credits used", value: creditsUsed.toLocaleString(), color: "#888" },
      ])}
      ${btn("View results", sessionUrl)}
    `,
    footerExtra: `You can disable session notifications in your <a href="${APP_URL}/settings" style="color:#555;text-decoration:none;">account settings</a>.`,
  });
}

// ── 6. Payment receipt (manual purchase) ─────────────────────────────────────

function paymentReceiptTemplate(
  name: string,
  creditsAdded: number,
  amountPaid: string,
  newBalance: number
): string {
  const safeName = escapeHtml(name);
  const now = new Date().toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return baseTemplate({
    badge: "Payment Confirmed",
    headline: `Credits loaded,<br>${safeName}.`,
    body: `
      ${paragraph("Your payment went through and your credits are ready to use.")}
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

// ── 7. Auto-refill triggered ──────────────────────────────────────────────────

function autoRefillTriggeredTemplate(
  name: string,
  balance: number,
  topUpUrl: string,
  dollarAmount: number
): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "Auto Top-Up Ready",
    badgeColor: "#f59e0b",
    headline: `Top-up prepared,<br>${safeName}.`,
    body: `
      ${paragraph(`Your balance has dropped to <strong style="color:#f59e0b;">${balance.toLocaleString()} credits</strong>, triggering your auto top-up. A $${dollarAmount} checkout has been prepared — click below to complete it and reload your credits instantly.`)}
      ${callout("This checkout link is unique to you and expires after 24 hours.", "#f59e0b")}
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;">${btn("Complete top-up", topUpUrl, "#f59e0b", "#000")}</td>
        <td>${btnOutline("Manage billing", `${APP_URL}/billing`)}</td>
      </tr></table>
    `,
    footerExtra: "You received this because your balance crossed your auto top-up threshold.",
  });
}

// ── 8. Account suspended ──────────────────────────────────────────────────────

function accountSuspendedTemplate(name: string, reason?: string): string {
  const safeName = escapeHtml(name);
  const safeReason = reason ? escapeHtml(reason) : null;
  return baseTemplate({
    badge: "Account Notice",
    badgeColor: "#ef4444",
    headline: `Your account<br>has been suspended.`,
    body: `
      ${paragraph(`Hi ${safeName}, your Litigant AI account has been suspended and you will not be able to sign in.`)}
      ${safeReason
        ? infoTable([{ label: "Reason", value: safeReason, color: "#888" }])
        : ""}
      ${callout("If you believe this is a mistake, please contact our support team and we'll review your account.", "#ef4444")}
      ${btn("Contact support", `mailto:support@litigant-ai.com`, "#ef4444", "#fff")}
    `,
    footerExtra: "This notice was sent to the email address associated with your account.",
  });
}

// ── 9. Re-engagement (14 days inactive) ──────────────────────────────────────

function reengagementTemplate(name: string, creditBalance: number): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "We Miss You",
    headline: `Still here for you,<br>${safeName}.`,
    body: `
      ${paragraph(`You have <strong style="color:#fff;">${creditBalance.toLocaleString()} credits</strong> waiting in your account. Pick up where you left off — the adversarial reasoning engine is ready when you are.`)}
      <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;margin:0 0 28px;">
        <tr>
          <td style="padding:18px 22px;border-bottom:1px solid #1a1a1a;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Case analysis</p>
            <p style="margin:0;font-size:13px;color:#888;">Submit a brief or case summary and get both sides argued in full.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 22px;border-bottom:1px solid #1a1a1a;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Strategy review</p>
            <p style="margin:0;font-size:13px;color:#888;">Test your arguments before filing — find the weaknesses first.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 22px;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Research</p>
            <p style="margin:0;font-size:13px;color:#888;">Rapid legal reasoning on any question, jurisdiction, or doctrine.</p>
          </td>
        </tr>
      </table>
      ${btn("Return to dashboard", `${APP_URL}/app`)}
    `,
    footerExtra: `<a href="${APP_URL}/settings" style="color:#444;text-decoration:none;">Unsubscribe from re-engagement emails</a>`,
  });
}

// ── 10. First session milestone ───────────────────────────────────────────────

function firstSessionTemplate(name: string, sessionTitle: string, sessionUrl: string): string {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(sessionTitle);
  return baseTemplate({
    badge: "First Session Complete",
    headline: `You just ran your<br>first session.`,
    body: `
      ${paragraph(`Nice work, ${safeName}. The adversarial reasoning engine has processed your first query — both sides have been argued. Your results are waiting.`)}
      ${infoTable([{ label: "Session", value: safeTitle }])}
      ${paragraph(`A few things worth knowing as you continue:`)}
      <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;margin:0 0 28px;">
        <tr>
          <td style="padding:16px 22px;border-bottom:1px solid #1a1a1a;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Rebuttal rounds</p>
            <p style="margin:0;font-size:13px;color:#888;">From inside a session you can challenge the answer and trigger a full rebuttal — useful for stress-testing arguments.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 22px;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Session history</p>
            <p style="margin:0;font-size:13px;color:#888;">Every session is saved. You can review, share, or export transcripts from your dashboard.</p>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;">${btn("View my results", sessionUrl)}</td>
        <td>${btnOutline("Back to dashboard", `${APP_URL}/app`)}</td>
      </tr></table>
    `,
  });
}

// ── 11. Zero credits ──────────────────────────────────────────────────────────

function zeroCreditsTemplate(name: string): string {
  const safeName = escapeHtml(name);
  return baseTemplate({
    badge: "Out of Credits",
    badgeColor: "#ef4444",
    headline: `You're out of<br>credits, ${safeName}.`,
    body: `
      ${paragraph("Your credit balance has hit zero. You won't be able to run new sessions until you top up.")}
      ${callout("Credits never expire once added — top up any amount and start again immediately.", "#ef4444")}
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;">${btn("Top up now", `${APP_URL}/billing`, "#ef4444", "#fff")}</td>
        <td>${btnOutline("View plans", `${APP_URL}/billing`)}</td>
      </tr></table>
    `,
    footerExtra: "You received this because your credit balance reached zero.",
  });
}

// ── Send functions ────────────────────────────────────────────────────────────

export async function sendVerificationEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const [user, billingDefaults] = await Promise.all([
    getAuth().getUser(uid),
    getBillingDefaults(),
  ]);
  const link = await getAuth().generateEmailVerificationLink(user.email!, {
    url: `${APP_URL}/login?verified=1`,
  });
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: "Verify your Litigant AI access",
    html: verificationTemplate(link, user.displayName ?? "Operator", billingDefaults.signupBonusCredits),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const link = await getAuth().generatePasswordResetLink(email, {
    url: `${APP_URL}/login?reset=1`,
  });
  let displayName = "Operator";
  try {
    const user = await getAuth().getUserByEmail(email);
    displayName = user.displayName ?? displayName;
  } catch { /* user not found — still send */ }
  const { error } = await getResend().emails.send({
    from: FROM,
    to: email,
    subject: "Reset your Litigant AI password",
    html: passwordResetTemplate(link, displayName),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendWelcomeEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: "Welcome to Litigant AI — you're in",
    html: welcomeTemplate(user.displayName ?? "Operator"),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendLowCreditsEmail(uid: string, balance: number, threshold: number): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: `Credit alert — ${balance.toLocaleString()} credits remaining`,
    html: lowCreditsTemplate(user.displayName ?? "Operator", balance, threshold),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendSessionCompleteEmail(
  uid: string,
  sessionId: string,
  title: string,
  creditsUsed: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: "Your analysis is ready",
    html: sessionCompleteTemplate(
      user.displayName ?? "Operator",
      title,
      creditsUsed,
      `${APP_URL}/app/session/${sessionId}`
    ),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendPaymentReceiptEmail(
  uid: string,
  creditsAdded: number,
  amountPaidCents: number,
  newBalance: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: `Receipt — ${creditsAdded.toLocaleString()} credits added`,
    html: paymentReceiptTemplate(
      user.displayName ?? "Operator",
      creditsAdded,
      `$${(amountPaidCents / 100).toFixed(2)}`,
      newBalance
    ),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendAutoRefillTriggeredEmail(
  uid: string,
  balance: number,
  topUpUrl: string,
  dollarAmount: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: `Auto top-up ready — complete your $${dollarAmount} reload`,
    html: autoRefillTriggeredTemplate(
      user.displayName ?? "Operator",
      balance,
      topUpUrl,
      dollarAmount
    ),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendAccountSuspendedEmail(uid: string, reason?: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  if (!user.email) return;
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email,
    subject: "Your Litigant AI account has been suspended",
    html: accountSuspendedTemplate(user.displayName ?? "Operator", reason),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendReengagementEmail(
  uid: string,
  creditBalance: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  if (!user.email) return;
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email,
    subject: `You have ${creditBalance.toLocaleString()} credits waiting`,
    html: reengagementTemplate(user.displayName ?? "Operator", creditBalance),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendFirstSessionEmail(
  uid: string,
  sessionId: string,
  title: string
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: "Your first session is ready",
    html: firstSessionTemplate(
      user.displayName ?? "Operator",
      title,
      `${APP_URL}/app/session/${sessionId}`
    ),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendZeroCreditsEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const { error } = await getResend().emails.send({
    from: FROM,
    to: user.email!,
    subject: "You're out of credits — top up to continue",
    html: zeroCreditsTemplate(user.displayName ?? "Operator"),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

/**
 * Sends re-engagement emails to users who:
 *  - have creditBalance > 0
 *  - have not had a session in the last `inactiveDays` days
 *  - have not received a re-engagement email in the last `inactiveDays` days
 * Returns the number of emails sent.
 */
export async function runReengagementCampaign(inactiveDays = 14): Promise<number> {
  if (!isFirebaseConfigured()) return 0;
  const db = getFirestoreDb();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
  const cutoffMs = cutoff.getTime();

  const snap = await db
    .collection("users")
    .where("creditBalance", ">", 0)
    .get();

  let sent = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const uid = doc.id;

    // Skip if they've been active recently
    const lastSessionMs = (data["lastSessionAt"] as number | undefined) ?? 0;
    if (lastSessionMs > cutoffMs) continue;

    // Skip if already re-engaged recently
    const lastReengagedMs = (data["reengagementEmailSentAt"] as number | undefined) ?? 0;
    if (lastReengagedMs > cutoffMs) continue;

    // Skip banned users
    if (data["banned"]) continue;

    try {
      await sendReengagementEmail(uid, data["creditBalance"] as number);
      await doc.ref.update({ reengagementEmailSentAt: Date.now() });
      sent++;
    } catch (e: any) {
      console.error(`[Reengagement] Failed for uid=${uid}: ${e.message}`);
    }
  }

  return sent;
}

export function isResendConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}
