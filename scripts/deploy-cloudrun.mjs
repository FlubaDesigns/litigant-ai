#!/usr/bin/env node
/**
 * deploy-cloudrun.mjs
 *
 * Generates a Cloud Run service YAML from live environment variables and
 * deploys via `gcloud run services replace`.  This avoids the placeholder
 * problem that occurs when --env-vars-file uses a static YAML with fake keys.
 *
 * Required env vars (must be set in the Replit Secrets panel):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — full SA JSON (minified)
 *   ANTHROPIC_API_KEY              — sk-ant-api03-…
 *   VITE_FIREBASE_PROJECT_ID       — GCP project id
 *
 * Optional env vars (left blank if absent):
 *   ADMIN_MASTER_SECRET
 *   OPENAI_API_KEY
 *   GEMINI_API_KEY
 *   XAI_API_KEY
 */

import { execSync } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const required = {
  sa:        process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  anthropic: process.env.ANTHROPIC_API_KEY,
  project:   process.env.VITE_FIREBASE_PROJECT_ID,
};

for (const [key, val] of Object.entries(required)) {
  if (!val) {
    console.error(`ERROR: Missing required env var for '${key}'. Check Replit Secrets.`);
    process.exit(1);
  }
}

// Warn (but don't block) if email/payment secrets are absent
const optionalWarn = ["RESEND_API_KEY", "SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID", "SQUARE_WEBHOOK_SIGNATURE_KEY"];
for (const v of optionalWarn) {
  if (!process.env[v]) console.warn(`WARN: ${v} is not set — emails/payments will be disabled in production.`);
}

function envEntry(name, value) {
  return `        - name: ${name}\n          value: ${JSON.stringify(value ?? "")}`;
}

const yaml = `apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: api
  namespace: "781960492360"
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        autoscaling.knative.dev/minScale: "0"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 600
      containers:
      - image: gcr.io/${required.project}/api:deploy-1784006283
        ports:
        - name: http1
          containerPort: 8080
        resources:
          limits:
            cpu: "1"
            memory: 512Mi
        env:
${envEntry("NODE_ENV", "production")}
${envEntry("APP_DOMAIN", "litigant-ai.com")}
${envEntry("FIREBASE_PROJECT_ID", required.project)}
${envEntry("FIREBASE_SERVICE_ACCOUNT", required.sa)}
${envEntry("ANTHROPIC_API_KEY", required.anthropic)}
${envEntry("ADMIN_MASTER_SECRET", process.env.ADMIN_MASTER_SECRET ?? "")}
${envEntry("OPENAI_API_KEY", process.env.OPENAI_API_KEY ?? "")}
${envEntry("GEMINI_API_KEY", process.env.GEMINI_API_KEY ?? "")}
${envEntry("XAI_API_KEY", process.env.XAI_API_KEY ?? "")}
${envEntry("RESEND_API_KEY", process.env.RESEND_API_KEY ?? "")}
${envEntry("SQUARE_ACCESS_TOKEN", process.env.SQUARE_ACCESS_TOKEN ?? "")}
${envEntry("SQUARE_LOCATION_ID", process.env.SQUARE_LOCATION_ID ?? "")}
${envEntry("SQUARE_WEBHOOK_SIGNATURE_KEY", process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "")}
${envEntry("SQUARE_ENVIRONMENT", process.env.SQUARE_ENVIRONMENT ?? "production")}
`;

// Private temp dir (random suffix, accessible only by owner) so the YAML
// containing the service account key and API keys is never in a shared,
// guessable location. File is also written with owner-only permissions.
const tmpDir = mkdtempSync(join(tmpdir(), "cloudrun-deploy-"));
const yamlPath = join(tmpDir, "service.yaml");
writeFileSync(yamlPath, yaml, { encoding: "utf8", mode: 0o600 });
console.log(`Service YAML written to ${yamlPath}`);
console.log(`  FIREBASE_SERVICE_ACCOUNT length : ${required.sa.length}`);
console.log(`  ANTHROPIC_API_KEY starts with   : ${required.anthropic.slice(0, 15)}…`);

try {
  execSync(
    `gcloud run services replace ${yamlPath} --region us-central1 --project ${required.project} --quiet`,
    { stdio: "inherit" }
  );
  console.log("✅ Cloud Run service updated.");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
