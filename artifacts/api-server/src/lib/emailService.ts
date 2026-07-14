import { Resend } from "resend";
import { getAuth } from "firebase-admin/auth";
import { isFirebaseConfigured } from "./firebaseAdmin.js";
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
 * user-controlled text into a raw HTML email template.
 *
 * displayName has no content restriction beyond a 2-character minimum
 * (see Register.tsx) and is never sanitized before reaching here — without
 * this, a display name like "<img src=x onerror=...>" would be inserted
 * verbatim into the email HTML this function builds.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function verificationTemplate(link: string, displayName?: string, bonusCredits = 500): string {
  const name = escapeHtml(displayName ?? "Operator");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:2px;color:#00c853;text-transform:uppercase;">Clearance Verification</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">Verify your access,<br>${name}.</h1>
            <p style="margin:0 0 32px;font-size:15px;color:#888;line-height:1.6;">A verification request was initiated for your Litigant AI account. Confirm your identity to activate full system access and unlock your <strong style="color:#fff;">${bonusCredits} free credits</strong> to get started.</p>
            <a href="${link}" style="display:inline-block;background:#00c853;color:#000;font-size:14px;font-weight:700;letter-spacing:0.5px;text-decoration:none;padding:14px 32px;border-radius:8px;">Verify Access →</a>
            <p style="margin:32px 0 0;font-size:12px;color:#555;line-height:1.6;">If you didn't create an account, you can safely ignore this message. This link expires in 24 hours.</p>
            <p style="margin:16px 0 0;font-size:11px;color:#444;">Or copy this link: <span style="color:#666;word-break:break-all;">${link}</span></p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;">© ${new Date().getFullYear()} Litigant AI · <a href="${APP_URL}" style="color:#555;text-decoration:none;">litigant-ai.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function passwordResetTemplate(link: string, displayName?: string): string {
  const name = escapeHtml(displayName ?? "Operator");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:2px;color:#00c853;text-transform:uppercase;">Security Alert</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">Reset your<br>credentials.</h1>
            <p style="margin:0 0 32px;font-size:15px;color:#888;line-height:1.6;">A password reset was requested for your Litigant AI account (${name}). Click below to set a new password.</p>
            <a href="${link}" style="display:inline-block;background:#00c853;color:#000;font-size:14px;font-weight:700;letter-spacing:0.5px;text-decoration:none;padding:14px 32px;border-radius:8px;">Reset Password →</a>
            <p style="margin:32px 0 0;font-size:12px;color:#555;line-height:1.6;">If you didn't request this, your account is safe — ignore this email. This link expires in 1 hour.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;">© ${new Date().getFullYear()} Litigant AI · <a href="${APP_URL}" style="color:#555;text-decoration:none;">litigant-ai.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function welcomeTemplate(displayName: string, appUrl: string): string {
  const name = escapeHtml(displayName);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:2px;color:#00c853;text-transform:uppercase;">Access Granted</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">Welcome aboard,<br>${name}.</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#888;line-height:1.6;">Your account is verified and your credits are loaded. You're ready to put the adversarial reasoning engine to work.</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;width:100%;">
              <tr>
                <td style="padding:16px 20px;border-right:1px solid #1a1a1a;width:50%;">
                  <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Start a session</p>
                  <p style="margin:0;font-size:13px;color:#aaa;">Ask your first legal question and see the engine argue both sides.</p>
                </td>
                <td style="padding:16px 20px;width:50%;">
                  <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Top up credits</p>
                  <p style="margin:0;font-size:13px;color:#aaa;">Credits never expire. Add more whenever you need them.</p>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;">
                  <a href="${appUrl}/app" style="display:inline-block;background:#00c853;color:#000;font-size:14px;font-weight:700;letter-spacing:0.5px;text-decoration:none;padding:14px 28px;border-radius:8px;">Open Dashboard →</a>
                </td>
                <td>
                  <a href="${appUrl}/billing" style="display:inline-block;background:transparent;color:#888;font-size:14px;font-weight:600;letter-spacing:0.3px;text-decoration:none;padding:14px 28px;border-radius:8px;border:1px solid #333;">Top Up</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;">© ${new Date().getFullYear()} Litigant AI · <a href="${appUrl}" style="color:#555;text-decoration:none;">litigant-ai.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function lowCreditsTemplate(displayName: string, balance: number, threshold: number, topUpUrl: string, appUrl: string): string {
  const name = escapeHtml(displayName);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:2px;color:#f59e0b;text-transform:uppercase;">Credit Alert</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">Running low,<br>${name}.</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#888;line-height:1.6;">Your balance has dropped to <strong style="color:#f59e0b;">${balance} credits</strong> — below your alert threshold of ${threshold}. Top up now to keep your sessions running without interruption.</p>
            <div style="background:#0a0a0a;border:1px solid #2a1a00;border-radius:8px;padding:16px 20px;margin:0 0 32px;">
              <p style="margin:0;font-size:13px;color:#f59e0b;">Credits never expire — add them any time and use them at your own pace.</p>
            </div>
            <a href="${topUpUrl}" style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:700;letter-spacing:0.5px;text-decoration:none;padding:14px 32px;border-radius:8px;">Top Up Credits →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;">© ${new Date().getFullYear()} Litigant AI · <a href="${appUrl}" style="color:#555;text-decoration:none;">litigant-ai.com</a> · You're receiving this because your balance crossed your alert threshold.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function sessionCompleteTemplate(displayName: string, sessionTitle: string, creditsUsed: number, sessionUrl: string, appUrl: string): string {
  const name = escapeHtml(displayName);
  const title = escapeHtml(sessionTitle);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:2px;color:#00c853;text-transform:uppercase;">Analysis Complete</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">Your session<br>is ready.</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#888;line-height:1.6;">Hey ${name}, the adversarial reasoning engine has finished analysing your query.</p>
            <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:16px 20px;margin:0 0 32px;">
              <p style="margin:0 0 6px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">Session</p>
              <p style="margin:0 0 12px;font-size:14px;color:#fff;font-weight:600;">${title}</p>
              <p style="margin:0;font-size:12px;color:#555;">${creditsUsed} credits used</p>
            </div>
            <a href="${sessionUrl}" style="display:inline-block;background:#00c853;color:#000;font-size:14px;font-weight:700;letter-spacing:0.5px;text-decoration:none;padding:14px 32px;border-radius:8px;">View Results →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;">© ${new Date().getFullYear()} Litigant AI · <a href="${appUrl}" style="color:#555;text-decoration:none;">litigant-ai.com</a> · You can disable session notifications in your <a href="${appUrl}/settings" style="color:#555;text-decoration:none;">account settings</a>.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const [user, billingDefaults] = await Promise.all([
    getAuth().getUser(uid),
    getBillingDefaults(),
  ]);
  const link = await getAuth().generateEmailVerificationLink(user.email!, {
    url: `${APP_URL}/login?verified=1`,
  });
  const r = getResend();
  const { error } = await r.emails.send({
    from: FROM,
    to: user.email!,
    subject: "Verify your Litigant AI access",
    html: verificationTemplate(link, user.displayName ?? undefined, billingDefaults.signupBonusCredits ?? 500),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const link = await getAuth().generatePasswordResetLink(email, {
    url: `${APP_URL}/login?reset=1`,
  });
  let displayName: string | undefined;
  try {
    const user = await getAuth().getUserByEmail(email);
    displayName = user.displayName ?? undefined;
  } catch { /* user not found — still send */ }
  const r = getResend();
  const { error } = await r.emails.send({
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
  const r = getResend();
  const { error } = await r.emails.send({
    from: FROM,
    to: user.email!,
    subject: "Welcome to Litigant AI — you're in",
    html: welcomeTemplate(user.displayName ?? "Operator", APP_URL),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendLowCreditsEmail(uid: string, balance: number, threshold: number): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const topUpUrl = `${APP_URL}/billing`;
  const r = getResend();
  const { error } = await r.emails.send({
    from: FROM,
    to: user.email!,
    subject: `Credit alert — ${balance} credits remaining`,
    html: lowCreditsTemplate(user.displayName ?? "Operator", balance, threshold, topUpUrl, APP_URL),
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
  const sessionUrl = `${APP_URL}/app/session/${sessionId}`;
  const r = getResend();
  const { error } = await r.emails.send({
    from: FROM,
    to: user.email!,
    subject: "Your analysis is ready",
    html: sessionCompleteTemplate(user.displayName ?? "Operator", title, creditsUsed, sessionUrl, APP_URL),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

function paymentReceiptTemplate(
  displayName: string,
  creditsAdded: number,
  amountPaid: string,
  newBalance: number,
  appUrl: string
): string {
  const name = escapeHtml(displayName);
  const now = new Date().toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1a1a1a;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#00c853;width:8px;height:8px;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Litigant AI</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:2px;color:#00c853;text-transform:uppercase;">Payment Confirmed</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">Credits loaded,<br>${name}.</h1>
            <p style="margin:0 0 32px;font-size:15px;color:#888;line-height:1.6;">Your payment went through and your credits are ready to use.</p>

            <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;margin:0 0 32px;">
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #1a1a1a;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:13px;color:#555;">Amount charged</td>
                      <td align="right" style="font-size:16px;font-weight:700;color:#fff;">${amountPaid}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #1a1a1a;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:13px;color:#555;">Credits added</td>
                      <td align="right" style="font-size:16px;font-weight:700;color:#00c853;">+${creditsAdded.toLocaleString()}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #1a1a1a;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:13px;color:#555;">New balance</td>
                      <td align="right" style="font-size:16px;font-weight:700;color:#fff;">${newBalance.toLocaleString()} credits</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:13px;color:#555;">Date</td>
                      <td align="right" style="font-size:13px;color:#666;">${now}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;font-size:13px;color:#555;line-height:1.6;">Credits never expire — use them whenever you need them.</p>
            <a href="${appUrl}/app" style="display:inline-block;background:#00c853;color:#000;font-size:14px;font-weight:700;letter-spacing:0.5px;text-decoration:none;padding:14px 32px;border-radius:8px;">Start a session →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="margin:0;font-size:11px;color:#444;">© ${new Date().getFullYear()} Litigant AI · <a href="${appUrl}" style="color:#555;text-decoration:none;">litigant-ai.com</a> · This is a receipt for your credit purchase. Keep it for your records.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPaymentReceiptEmail(
  uid: string,
  creditsAdded: number,
  amountPaidCents: number,
  newBalance: number
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const amountPaid = `$${(amountPaidCents / 100).toFixed(2)}`;
  const r = getResend();
  const { error } = await r.emails.send({
    from: FROM,
    to: user.email!,
    subject: `Receipt — ${creditsAdded.toLocaleString()} credits added to your account`,
    html: paymentReceiptTemplate(
      user.displayName ?? "Operator",
      creditsAdded,
      amountPaid,
      newBalance,
      APP_URL
    ),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export function isResendConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}
