---
name: Cloud Run env vars
description: Required env vars and gotchas when patching the Cloud Run service.
---

**Required env vars on the Cloud Run service:**
- `NODE_ENV` = `production`
- `FIREBASE_CONFIG` = `{"projectId":"litigant-ai"}` (JSON string)
- `FIREBASE_SERVICE_ACCOUNT` = full service account JSON (from the `FIREBASE_SERVICE_ACCOUNT` Replit secret)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` (from Replit secret)
- `AI_INTEGRATIONS_OPENAI_API_KEY` (from Replit secret)

**Gotchas:**
- `PORT` is **reserved** by Cloud Run — attempting to set it in the `env` array returns a 400 INVALID_ARGUMENT error. Never include it.
- `allUsers` invoker IAM does **NOT persist** across Cloud Run deploys. Must re-grant `roles/run.invoker` to `allUsers` via the v1 IAM API (`setIamPolicy`) after every PATCH/deploy.
- Cloud Run URL: `https://api-le65pgztia-uc.a.run.app` (us-central1).
- Firebase Hosting CDN may take 30-60 seconds to propagate after a Cloud Run deploy. The new revision is live instantly on the direct URL.

**Why:** Cloud Run injects PORT automatically; the IAM policy is revision-scoped and resets.
