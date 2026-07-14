---
name: Cloud Run env vars
description: Required env vars and gotchas when patching the Cloud Run service.
---

**Complete env vars on the Cloud Run service (verified 2026-07-14 via `gcloud run services describe`):**
- `NODE_ENV` = `production`
- `APP_DOMAIN` = `litigant-ai.com`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT` = full service account JSON
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `ADMIN_MASTER_SECRET`
- `RESEND_API_KEY` ✅ (added 2026-07-14 — was missing, emails were silently failing)
- `SQUARE_ACCESS_TOKEN` ✅ (added 2026-07-14 — was missing, payments were silently failing)
- `SQUARE_LOCATION_ID` ✅ (added 2026-07-14)
- `SQUARE_WEBHOOK_SIGNATURE_KEY` ✅ (added 2026-07-14)
- `SQUARE_ENVIRONMENT` ✅ (added 2026-07-14, defaults to "production")

**NOT deployed to Cloud Run (intentional):**
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit-only localhost proxy, breaks on Cloud Run
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit-only dummy key, not needed on Cloud Run
- `PORT` — reserved by Cloud Run; never include it

**How to deploy:**
- Run `node scripts/deploy-cloudrun.mjs` (reads all vars from Replit secrets)
- Script includes a warning if any email/payment secrets are absent before deploying
- After deploy, `allUsers` invoker IAM is re-granted automatically by the script

**Gotchas:**
- `allUsers` invoker IAM does **NOT persist** across Cloud Run deploys. Script re-grants after each deploy.
- Firebase Hosting CDN may take 30-60 seconds to propagate after a Cloud Run deploy.
- NEVER use `--set-env-vars` or `--set-secrets` on the CLI — only `services replace` with the full YAML works reliably (avoids type-conflict errors from mixed plain/secret-ref history).

**Why:** Cloud Run locks the type (plain vs. secret ref) of each env var once set; `services replace` with a full spec overrides that cleanly.
