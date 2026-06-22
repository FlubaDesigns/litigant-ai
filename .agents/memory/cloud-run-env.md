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
- `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `ADMIN_MASTER_SECRET`
- `BASE_PATH` = `/api-server`

**Gotchas:**
- `PORT` is **reserved** by Cloud Run — never include it.
- `allUsers` invoker IAM does **NOT persist** across Cloud Run deploys. Must re-grant `roles/run.invoker` to `allUsers` after every deploy.
- Cloud Run URL: `https://api-le65pgztia-uc.a.run.app` (us-central1).
- Firebase Hosting CDN may take 30-60 seconds to propagate after a Cloud Run deploy.

**Secret Manager status (as of 2026-06-22):**
- Secret Manager API is NOW ENABLED on the project.
- All 7 secrets exist in Secret Manager (created from Replit env vars).
- BUT: the firebase-adminsdk SA lacks `setIamPolicy` permission and CANNOT grant `roles/secretmanager.secretAccessor` to the compute SA (`781960492360-compute@developer.gserviceaccount.com`). To use `--set-secrets`, a project Owner must manually grant that role in GCP Console.
- **Current workaround:** use `gcloud run services replace /tmp/cr-replace.yaml` with a plain-value YAML (all `value:` not `secretKeyRef:`). Build the YAML with Python from Replit env vars. This bypasses the type-conflict error ("Cannot update env var to string literal because it has already been set with a different type").
- NEVER use `--set-env-vars` or `--set-secrets` on the CLI for this service — only `services replace` with the full YAML works reliably given the mixed-type history.

**Why:** Cloud Run locks the type (plain vs. secret ref) of each env var once set; `services replace` with a full spec overrides that cleanly.
