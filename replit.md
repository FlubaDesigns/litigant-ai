# Litigant AI

Multi-AI courtroom reasoning engine. Users submit a question; multiple AI agents debate, critique, and synthesize before returning a confidence-scored verdict. Slogan: "Don't just ask AI. Put the question on trial."

## Run & Operate

- `pnpm --filter @workspace/gh-brain run dev` — frontend dev server (Vite, port from `PORT`)
- `pnpm --filter @workspace/api-server run dev` — API server (Express, port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- Preview at `/gh-brain` and API at `/api-server/api`

## Stack

- pnpm workspaces, Node.js, TypeScript
- Frontend: React + Vite + Wouter (routing) + Tailwind + shadcn/ui + Framer Motion
- Backend: Express 5 + esbuild bundle
- Auth + DB: Firebase Auth + Firestore (graceful fallback when unconfigured)
- Payments: Stripe (via `stripe-replit-sync` connector)
- Brand: electric green `#00c853` on near-black

## Where things live

- `artifacts/gh-brain/src/pages/` — all frontend pages
- `artifacts/gh-brain/src/services/` — API clients (adminService, authService, sessionService, etc.)
- `artifacts/gh-brain/src/hooks/` — useFeatureFlag, useBrainSession, useUserProfile
- `artifacts/api-server/src/routes/` — all Express routes
- `artifacts/api-server/src/lib/` — brainEngine, firebaseAdmin, creditLedger, stripeClient
- `scripts/src/set-admin-claim.ts` — one-time CLI to promote a user to admin

## Architecture decisions

- All credit mutations go through `addCredits()` / `reserveCredits()` / `reconcileCredits()` — never raw `FieldValue.increment()`. Every call writes an immutable `credit_transactions` ledger entry.
- Admin data reads use Express routes with `requireAdmin` middleware (checks `admin: true` Firebase custom claim) instead of Cloud Functions — equivalent security, simpler ops.
- Feature flags live in Firestore `config/featureFlags` and are publicly readable via `GET /api/feature-flags`. Writes require admin.
- Stripe webhook idempotency: `stripe_events/{eventId}` is checked atomically before any credit grant.
- Firebase not configured in dev → all Firebase paths skip gracefully; app runs in guest mode.

## Admin Setup

### 1. Set ADMIN_MASTER_SECRET

Add `ADMIN_MASTER_SECRET=<your-secret>` to Replit secrets. This secret gates the `/admin/set-claim` endpoint.

### 2. Promote a user to admin

**Option A — via API (no CLI needed):**
```bash
curl -X POST https://<your-domain>/api-server/api/admin/set-claim \
  -H "Content-Type: application/json" \
  -d '{"secret":"<ADMIN_MASTER_SECRET>","email":"you@example.com"}'
```

**Option B — via CLI script:**
```bash
FIREBASE_SERVICE_ACCOUNT='<json>' pnpm --filter @workspace/scripts \
  exec tsx src/set-admin-claim.ts you@example.com
```

After either method, the user must **sign out and sign back in** for the `admin: true` claim to appear in their ID token. The `/admin` route in the app becomes visible in the nav once the claim is active.

### 3. Required Firebase env vars

Set these in Replit Secrets:
- `FIREBASE_SERVICE_ACCOUNT` — service account JSON (for API server)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Stripe deps are installed at workspace root (`-w` flag) but not in `api-server/package.json` — works via hoisting but is brittle for isolated installs.
- Admin user search: email searches use Firestore range query (prefix match). Name searches fetch up to 200 records and filter client-side (no full-text index).
- Ban endpoint: sets Firestore `banned` flag AND disables Firebase Auth account. If Auth update fails, Firestore flag is still set and `authWarning` is returned in the response.
- `api_logs` collection starts empty until brain.ts writes to it. Error Logs tab falls back to `sessions.status === "error"` in the meantime.
