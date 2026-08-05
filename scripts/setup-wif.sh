#!/usr/bin/env bash
# ============================================================
# Workload Identity Federation — one-time setup for litigant-ai
#
# Run this in Google Cloud Shell (the >_ button in the GCP
# console). You do NOT need gcloud installed locally.
#
# What it does:
#   1. Creates a WIF pool called "github-actions"
#   2. Creates an OIDC provider locked to FlubaDesigns/litigant-ai
#   3. Lets the App Engine default SA be impersonated by that repo
#
# After this runs you never need a service-account JSON key again.
# ============================================================

set -euo pipefail

PROJECT_ID="litigant-ai"
SA_EMAIL="litigant-ai@appspot.gserviceaccount.com"
POOL_ID="github-actions"
PROVIDER_ID="github"
GITHUB_REPO="FlubaDesigns/litigant-ai"

# ── Step 0: confirm project ──────────────────────────────────
gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
echo "Project number: $PROJECT_NUMBER"

# ── Step 1: enable required APIs ────────────────────────────
echo "Enabling APIs..."
gcloud services enable iamcredentials.googleapis.com \
                       sts.googleapis.com \
                       --project="$PROJECT_ID"

# ── Step 2: create the WIF pool ─────────────────────────────
echo "Creating WIF pool..."
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --display-name="GitHub Actions Pool" \
  --description="Keyless auth for GitHub Actions workflows" \
  || echo "(pool already exists — skipping)"

# ── Step 3: create the OIDC provider ────────────────────────
# Locked to your exact repo so no other repo can impersonate the SA.
echo "Creating OIDC provider..."
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
  || echo "(provider already exists — skipping)"

# ── Step 4: bind the SA to the pool ─────────────────────────
echo "Binding service account..."
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}"

# ── Step 5: print the values you need for GitHub Actions ─────
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "✅  WIF setup complete. Add these two GitHub Actions secrets"
echo "    at https://github.com/FlubaDesigns/litigant-ai/settings/secrets/actions"
echo ""
echo "  Secret name : WIF_PROVIDER"
echo "  Secret value: ${WIF_PROVIDER}"
echo ""
echo "  Secret name : WIF_SERVICE_ACCOUNT"
echo "  Secret value: ${SA_EMAIL}"
echo "══════════════════════════════════════════════════════════"
