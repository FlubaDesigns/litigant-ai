import { Resend } from "resend";
import { getAuth } from "firebase-admin/auth";
import { isFirebaseConfigured } from "./firebaseAdmin.js";

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

function verificationTemplate(link: string, displayName?: string): string {
  const name = displayName ?? "Operator";
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
            <p style="margin:0 0 32px;font-size:15px;color:#888;line-height:1.6;">A verification request was initiated for your Litigant AI account. Confirm your identity to activate full system access.</p>
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
  const name = displayName ?? "Operator";
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

export async function sendVerificationEmail(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const user = await getAuth().getUser(uid);
  const link = await getAuth().generateEmailVerificationLink(user.email!, {
    url: `${APP_URL}/login?verified=1`,
  });
  const r = getResend();
  const { error } = await r.emails.send({
    from: FROM,
    to: user.email!,
    subject: "Verify your Litigant AI access",
    html: verificationTemplate(link, user.displayName ?? undefined),
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

export function isResendConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}
