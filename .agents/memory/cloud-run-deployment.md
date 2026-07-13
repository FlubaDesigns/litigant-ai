---
name: Cloud Run deployment
description: How to deploy the api-server to Cloud Run; Firebase Functions buildpack is unusable.
---

Firebase Cloud Functions Gen2 uses a custom Node.js buildpack that sets its own container CMD, completely ignoring `npm start`, `Procfile`, or any custom entrypoint. The buildpack tries to invoke the firebase-functions framework, which fails with our ESM bundle.

**The working approach:**
1. Build a standalone Express server entrypoint (`server-cloudrun.ts` → `firebase-functions/lib/server.mjs`) via esbuild: `node artifacts/api-server/build-functions.mjs`.
2. Pack the `firebase-functions/` directory (excluding `node_modules`) as a `tar.gz`.
3. Upload to GCS bucket `gcf-v2-sources-781960492360-us-central1`.
4. Submit a Cloud Build job via the Cloud Build API (uses `gcr.io/cloud-builders/docker`), building image `gcr.io/litigant-ai/api:deploy-<timestamp>`.
5. PATCH the Cloud Run service via the Cloud Run v2 API with the new **timestamped** image tag.
6. Re-grant `roles/run.invoker` to `allUsers` via the Cloud Run v1 IAM API (does not persist across deploys).

**CRITICAL — Timestamped image tag:** Always use `gcr.io/litigant-ai/api:deploy-<timestamp>` (not bare `:latest`). Cloud Run detects no change when the image reference is identical and will NOT create a new revision, even if the underlying image content changed.

**CRITICAL — Routes entry point:** `app-firebase.ts` imports from `./routes/index-firebase.ts` (NOT `index.ts`). Any new route registered in `index.ts` MUST also be added to `index-firebase.ts` or it will be missing from the Cloud Run deployment.

**google-auth-library location:** `firebase-functions/node_modules/google-auth-library` — use `createRequire` to import it in `.mjs` scripts.

**firebase.json** uses `"run": {"serviceId": "api", "region": "us-central1"}` rewrite (NOT `"function": "api"`). No Firebase Functions deployment needed.

**Why:** Firebase Functions buildpack is designed for its own framework; it ignores all standard container startup conventions.

**How to apply:** Any time the api-server needs a new production deployment, follow steps 1-7 above. Do NOT use `firebase deploy --only functions`.
