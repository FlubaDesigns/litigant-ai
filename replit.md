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
- Payments: Square (credit packs via Square Payment Links + webhooks)
- Brand: electric green `#00c853` on near-black

## Where things live

- `artifacts/gh-brain/src/pages/` — all frontend pages
- `artifacts/gh-brain/src/services/` — API clients (adminService, authService, sessionService, etc.)
- `artifacts/gh-brain/src/hooks/` — useFeatureFlag, useBrainSession, useUserProfile
- `artifacts/api-server/src/routes/` — all Express routes
- `artifacts/api-server/src/lib/` — brainEngine, firebaseAdmin, creditLedger, squareClient
- `artifacts/api-server/src/seats/` — per-seat AI system prompt briefs (orchestrator, moderator, architect, builder, auditor, litigant)
- `scripts/src/set-admin-claim.ts` — one-time CLI to promote a user to admin
- `scripts/build-release.py` — builds `downloads/litigant-ai-latest.zip` with completeness check + SHA-256
- `docs/firebase-audit.md` — full inventory of all Firestore collections, Auth calls, Cloud Functions config

## Architecture decisions

- All credit mutations go through `addCredits()` / `reserveCredits()` / `reconcileCredits()` — never raw `FieldValue.increment()`. Every call writes an immutable `credit_transactions` ledger entry.
- Admin data reads use Express routes with `requireAdmin` middleware (checks `admin: true` Firebase custom claim) instead of Cloud Functions — equivalent security, simpler ops.
- Feature flags live in Firestore `config/featureFlags` and are publicly readable via `GET /api/feature-flags`. Writes require admin.
- Square webhook idempotency: `square_events/{eventId}` is checked atomically before any credit grant.
- Firebase not configured in dev → all Firebase paths skip gracefully; app runs in guest mode.

## Rebuttal Loop

After a completed session the user can challenge the verdict. Submitting a challenge triggers a full new brain run with three additions to the context: the original question, the original verdict, and the user's specific objection. Every seat is instructed to address the objection directly and determine whether to uphold, amend, or reverse.

- **Frontend:** `useBrainSession.ts` → `submitRebuttal(challenge)` dispatches `REBUTTAL_SUBMIT` (archives prior verdict into `state.rebuttals[]`, increments `state.rebuttalRound`) then fires a new `runBrainSession` call with `rebuttalContext` attached.
- **Service:** `sessionService.ts` → `BrainRunRequest.rebuttalContext` carries `{ challenge, originalVerdict, rebuttalRound, parentSessionId }` to the API.
- **Backend:** `brainEngine.ts` → when `rebuttalContext` is present, `baseContext` is rewritten to include the original verdict and challenge; the Orchestrator's opening message acknowledges the challenge by name.
- **Persistence:** `brain.ts` → rebuttal sessions saved to Firestore with `isRebuttal: true`, `rebuttalRound`, `rebuttalChallenge`, `parentSessionId`; title prefixed `[Rebuttal N]`.
- **UI:** `Session.tsx` → "Challenge the Verdict" card appears below output tabs when `phase === "complete"`. Shows past challenge trail (R1, R2…), textarea, Reconvene button, credit check, and New Case button.

## Admin-only UI Gating

The Landing Page artifact type shows a generic description to all users. Admins (`isAdmin === true` from Firebase custom claim) see the internal roadmap note ("Git integration in v2"). Controlled via `isAdmin` prop on `ConfigPanel` in `Session.tsx`.

## Static Assets

Tool page images in `artifacts/gh-brain/public/tools/` are JPEG (converted from PNG). References in `artifacts/gh-brain/src/data/toolPages.ts` use `.jpg` extensions. Do not re-add PNG versions — they were 15 MB combined vs 1 MB as JPEG at quality 82.

## Release Builds

```bash
python3 scripts/build-release.py
```

Outputs `downloads/litigant-ai-latest.zip` (source code, no node_modules/dist/logs) and `downloads/litigant-ai-latest.sha256`. Verifies 33 required files are present before sealing. Fails loudly if any are missing.

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

- Square client is instantiated in `artifacts/api-server/src/lib/squareClient.ts` — requires `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, and `SQUARE_LOCATION_ID` to be set.
- Admin user search: email searches use Firestore range query (prefix match). Name searches fetch up to 200 records and filter client-side (no full-text index).
- Ban endpoint: sets Firestore `banned` flag AND disables Firebase Auth account. If Auth update fails, Firestore flag is still set and `authWarning` is returned in the response.
- `api_logs` collection starts empty until brain.ts writes to it. Error Logs tab falls back to `sessions.status === "error"` in the meantime.
