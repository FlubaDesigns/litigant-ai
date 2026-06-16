---
name: Cloud Run deployment
description: How to deploy the api-server to Cloud Run; Firebase Functions buildpack is unusable.
---

Firebase Cloud Functions Gen2 uses a custom Node.js buildpack that sets its own container CMD, completely ignoring `npm start`, `Procfile`, or any custom entrypoint. The buildpack tries to invoke the firebase-functions framework, which fails with our ESM bundle.

**The working approach:**
1. Build a standalone Express server entrypoint (`server-cloudrun.ts` → `firebase-functions/lib/server.mjs`) via esbuild.
2. Write a `Dockerfile` in `firebase-functions/` that runs `node lib/server.mjs`.
3. Pack the `firebase-functions/` directory (excluding `node_modules`) as a `tar.gz`.
4. Upload to GCS bucket `gcf-v2-sources-781960492360-us-central1`.
5. Submit a Cloud Build job via the Cloud Build API (uses `gcr.io/cloud-builders/docker`).
6. PATCH the Cloud Run service via the Cloud Run v2 API with the new image.
7. Re-grant `roles/run.invoker` to `allUsers` via the Cloud Run v1 IAM API (does not persist across deploys).

**firebase.json** uses `"run": {"serviceId": "api", "region": "us-central1"}` rewrite (NOT `"function": "api"`). No Firebase Functions deployment needed.

**Why:** Firebase Functions buildpack is designed for its own framework; it ignores all standard container startup conventions.

**How to apply:** Any time the api-server needs a new production deployment, follow steps 1-7 above. Do NOT use `firebase deploy --only functions`.
