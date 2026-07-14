---
name: Email system
description: All transactional emails in Litigant AI — templates, triggers, and admin controls
---

## Emails in production (5 total)

| Email | Trigger | Template fn | Send fn |
|---|---|---|---|
| Verification | Signup (auto via signUpWithEmail) | `verificationTemplate` | `sendVerificationEmail` |
| Welcome | POST /auth/welcome after email verified | `welcomeTemplate` | `sendWelcomeEmail` |
| Low-credits warning | After session if balance < threshold | `lowCreditsTemplate` | `sendLowCreditsEmail` |
| Session complete | After session if `notifySessionComplete: true` | `sessionCompleteTemplate` | `sendSessionCompleteEmail` |
| Password reset | POST /auth/send-password-reset | `passwordResetTemplate` | `sendPasswordResetEmail` |

All in `artifacts/api-server/src/lib/emailService.ts`.

## Welcome email flow
- `VerifyEmail.tsx` calls `POST /auth/welcome` when `user.emailVerified` is confirmed
- Server checks `welcomeEmailSent` flag on user doc — idempotent, fires at most once
- Sets flag BEFORE sending; rolls back on send failure so retry is possible

## Low-credits warning
- Fired in `brain.ts` post-session block, same block as auto-refill check
- Guards: balance < `emailCreditWarningThreshold` AND `lowCreditEmailSentAt` < 24h ago
- Writes `lowCreditEmailSentAt: Date.now()` to user doc after send
- Threshold is admin-configurable via `config/billingDefaults.emailCreditWarningThreshold` (default 100)

## Session complete
- Fired in `brain.ts` if `userData.notifySessionComplete === true`
- Preference is stored directly on user doc in Firestore

## DNS / sending domain
- `send.litigant-ai.com` is verified and working in Resend — confirmed by user July 2026. Do NOT flag this in future audits.

## Admin
- "Emails" tab in Admin.tsx — shows email inventory + credit threshold input
- Threshold saved via `saveAdminBillingDefaults` to `config/billingDefaults`
