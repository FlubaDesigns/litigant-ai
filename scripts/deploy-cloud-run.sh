#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-litigant-ai}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE_NAME="api"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# ── 1. Build cloud function bundles ───────────────────────────────────────────
echo "▶ Building cloud function bundles…"
node artifacts/api-server/build-functions.mjs

# ── 2. Build Docker image ─────────────────────────────────────────────────────
echo "▶ Building Docker image: ${IMAGE}…"
docker build -t "${IMAGE}" firebase-functions/

# ── 3. Push to Google Container Registry ─────────────────────────────────────
echo "▶ Pushing image to GCR…"
docker push "${IMAGE}"

# ── 4. Deploy to Cloud Run ────────────────────────────────────────────────────
echo "▶ Deploying to Cloud Run (${SERVICE_NAME} @ ${REGION})…"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 540 \
  --concurrency 80 \
  --env-vars-file scripts/cloud-run-env.yaml

echo ""
echo "✅ Cloud Run service '${SERVICE_NAME}' deployed."
echo "   Run 'firebase deploy --only hosting' to update Firebase Hosting rewrites."
