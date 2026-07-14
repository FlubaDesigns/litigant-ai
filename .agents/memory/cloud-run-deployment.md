---
name: Cloud Run deployment
description: How to deploy the api-server to Cloud Run with a new Docker image.
---

**Full deploy flow (all three steps required for a code change):**

```bash
# Step 1 — Bundle TypeScript → firebase-functions/lib/server.mjs
node artifacts/api-server/build-functions.mjs

# Step 2 — Build + push Docker image (use a fresh timestamp each time)
IMAGE_TAG="deploy-$(date +%s)"
gcloud builds submit firebase-functions/ \
  --tag "gcr.io/$VITE_FIREBASE_PROJECT_ID/api:${IMAGE_TAG}" \
  --project "$VITE_FIREBASE_PROJECT_ID" \
  --timeout=300

# Step 3 — Update tag in scripts/deploy-cloudrun.mjs, then:
node scripts/deploy-cloudrun.mjs
```

**CRITICAL — Timestamped image tag:** Always use a fresh `deploy-<timestamp>` tag. Cloud Run will NOT create a new revision if the image reference is identical.

**Env-var-only change** (no code change): just run `node scripts/deploy-cloudrun.mjs` directly — no Docker rebuild needed. The script reads all secrets from Replit env vars.

**Routes entry point:** `app-firebase.ts` imports `./routes/index-firebase.ts` (NOT `index.ts`). New routes must be in both or they won't reach Cloud Run.

**Current image:** `gcr.io/litigant-ai/api:deploy-1784007865` (July 14, 2026)

**Why:** Firebase Functions buildpack ignores npm start/Procfile entirely; we build a standalone Express server and deploy it as a plain Docker container on Cloud Run.
