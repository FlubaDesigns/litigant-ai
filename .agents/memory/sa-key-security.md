---
name: SA key security
description: Rules for handling Firebase service account JSON keys safely
---

## Rule
Never paste SA JSON in chat and never commit it to the repo. Google automatically disables service account keys detected in public GitHub repositories within minutes of detection.

**Why:** The litigant-ai repo is public. In July 2026 two keys were auto-disabled this way, taking production down both times. GitHub's push protection also blocks pushes containing secrets.

**How to apply:**
- User should attach the JSON file (not paste it) — the file lands in `attached_assets/` which is gitignored
- Read the file directly with the `read` tool
- Push to GitHub Secrets via the GitHub Secrets API (encrypt with repo public key using PyNaCl)
- Update Replit's `FIREBASE_SERVICE_ACCOUNT_JSON` via `requestEnvVar`
- Delete the file from `attached_assets/` immediately after reading
- Never display or re-print the key contents in chat

## GitHub Secrets API endpoint
`GET /repos/{owner}/{repo}/actions/secrets/public-key` (note: must include `/secrets/` in path — `/actions/public-key` returns 404)

## Current active key
Key ID `795ab1b205970bcae2ef73b1b42c96c1b8a58ff8` — pushed to GitHub Secrets and deployed to Cloud Run July 14, 2026.

## Replit FIREBASE_SERVICE_ACCOUNT_JSON
The Replit secret may lag behind the GitHub Secrets value. Since GitHub Actions now handles all deploys, Replit's copy is only needed for running `node scripts/deploy-cloudrun.mjs` manually.
