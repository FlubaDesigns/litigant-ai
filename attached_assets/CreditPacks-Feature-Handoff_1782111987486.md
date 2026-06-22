# Credit Packs Admin Feature — Handoff

Built per our discussion: credit packs move from hardcoded-in-source to admin-editable, following the exact same pattern this codebase already uses for model pricing multipliers (`pricingConfig.ts`), seat briefs, and the conscience clause — hardcoded fallback, Firestore override, in-memory cache, explicit invalidation on write.

**Decisions made, as agreed:**
- Pack `id` is permanent once created — never editable.
- No hard delete — only deactivate (`active: false`) / reactivate.
- `unit_amount` (price) and `creditAmount` are bounds-checked on every write, the same way the existing multiplier route already bounds-checks `1–100`.

---

## What was built

### 1. New file: `artifacts/api-server/src/lib/creditPacksConfig.ts`
The Firestore-aware layer. Exports:
- `getAllCreditPacks()` — merges Firestore overrides on top of the hardcoded fallback, cached 60 seconds.
- `getActiveCreditPacks()` — the same, filtered to `active: true`, in stable order. This is what customer-facing checkout should read from.
- `findCreditPackByPriceId(priceId)` — the live-aware version of `creditPacks.ts`'s existing `findPackByPriceId`, async, checks Firestore first.
- `createCreditPack(pack)` — fails if the id already exists.
- `updateCreditPack(id, updates)` — edits name/description/active/price/creditAmount. The id itself is never accepted as an input field here — it's only ever read from the existing stored pack — so there's no way to rename a pack through this function even by mistake.
- `deactivateCreditPack(id)` — soft-delete, sets `active: false`.
- `invalidateCreditPacksCache()` — called automatically by every admin write.
- `CREDIT_PACK_BOUNDS` — the hard limits enforced at the route layer: price $0.50–$1000, credits 1–1,000,000.

Firestore location: `config/creditPacks`, shape `{ packs: { [id]: CreditPack }, updatedAt }` — a map keyed by id (not an array), so a single-pack edit can use a merge write that only touches that one key, the same trick `apiKeyStore.ts` already uses for its `providers` map.

### 2. `artifacts/api-server/src/routes/admin.ts` — 4 new routes
- `GET /admin/credit-packs` — list all packs (active + deactivated) plus the bounds, for the admin table.
- `POST /admin/credit-packs` — create. Validates `id` format (lowercase/numbers/underscores), required `name`, and both numeric bounds before writing. Returns `409` if the id is already taken.
- `PATCH /admin/credit-packs/:id` — edit. Same bounds validation on any field that's actually being changed; `id` is read from the URL param only, never from the body.
- `DELETE /admin/credit-packs/:id` — deactivate (not a real delete). Returns `404` if the id doesn't exist.

All four sit behind `requireAdmin`, the same middleware every other admin route in this file uses — verified token, real `admin` custom claim, no exceptions.

### 3. `artifacts/api-server/src/routes/billing.ts` and `brain.ts` — switched to the live lookup
`GET /billing/products`, `POST /billing/checkout`, and `brain.ts`'s auto-refill checkout link creator all previously read from the hardcoded `CREDIT_PACKS` array directly. All three now go through the new Firestore-aware functions, so a pack an admin creates is actually purchasable, not just visible. The response shape from `GET /billing/products` is unchanged (`{ data: [...] }`), so the existing customer-facing `Billing.tsx` needs no changes and will pick up admin edits automatically.

### 4. Frontend: `adminService.ts` + `Admin.tsx`
New `Credit Packs` tab, sitting next to the existing `Pricing` tab. Table view of active packs with inline Edit/Deactivate actions, a separate dimmed section for deactivated packs with a Reactivate button, and a dialog for both creating new packs and editing existing ones — id is a locked, disabled field in edit mode, a validated lowercase-only field in create mode.

---

## What I verified, and how

**Import graph, traced by hand in both directions:** every name imported by `admin.ts`, `billing.ts`, and `brain.ts` from the new `creditPacksConfig.ts` matches a real export — checked the actual export list against each import list directly, not assumed from what I intended to write. Same check in reverse: `creditPacksConfig.ts`'s own imports (`getFirestoreDb`, `FieldValue`, `CREDIT_PACKS`/`CreditPack`/`CreditPackPrice`) all resolve to real exports in `firebaseAdmin.ts` and `creditPacks.ts`. Same check on the frontend side: `Admin.tsx`'s new imports from `adminService.ts` match that file's real new exports exactly.

**Syntax, checked with a real parser, not just read by eye:** every edited/new file passed `node --experimental-strip-types --check` (backend) or a `tsc --noEmit` JSX-aware parse (frontend) with zero syntax errors.

**Type-shape consistency, checked after I found and fixed my own mismatch:** I'd initially written an inline duplicate of the bounds object's shape in `Admin.tsx` instead of importing the real `CreditPackBounds` type — caught it by comparing the two side by side, fixed it to import the real type instead, and re-ran the parse check to confirm the fix didn't change the error profile.

**No Firestore document collision:** checked every existing `config/*` document name used elsewhere in this codebase (`apiKeys`, `pricing`, `featureFlags`) against the new `creditPacks` name — confirmed distinct, no overwrite risk.

**Cold-start behavior, traced through the actual merge logic:** confirmed by reading the code (not assumed) that `getAllCreditPacks()` correctly falls through to the hardcoded fallback when the Firestore document doesn't exist yet (`doc.exists` false → `data.packs ?? {}` → `{}` → merge yields the fallback unchanged), so the admin's first visit to the new tab shows the three real existing packs with zero setup or seed script required.

**Cloud Functions deployment path, traced through the real build config:** confirmed both real production entry points (`functions.ts` for Cloud Functions, `server-cloudrun.ts` for Cloud Run) wrap the same `app-firebase.ts` → `routes/index-firebase.ts` chain, and that `index-firebase.ts` already imports and registers `adminRouter` from `./admin` — meaning the new routes are live on both real deployment targets automatically, with no new registration needed anywhere. Checked the bundler's `external` exclusion list in `build-functions.mjs` and confirmed every import the new code uses (`firebase-admin/firestore`, the existing internal `lib/` modules) was already flowing through this exact bundler before my change — no new package introduced.

---

## What I could NOT verify, stated plainly

There is no `node_modules` installed anywhere in this project as uploaded, and I have no network access in this sandbox to install one. That means:
- **I could not run a real, dependency-resolved `tsc` type-check.** The parse checks I ran confirm syntax is valid and catch a wide range of real mistakes (typos, unbalanced braces, wrong import names), but they cannot catch a type-level error that only a real React/Express type-checker would find — for example, if I'd passed the wrong shape into a typed prop in a way that's still syntactically valid.
- **I could not actually run `esbuild` against `build-functions.mjs` to produce a real bundle.** I verified the import graph and the bundler's external-package list by hand instead. This is a reasonable substitute for confidence, but it is not the same as a successful build log.
- **I could not deploy this and exercise it against a real Firestore project.** Everything about the cold-start fallback behavior, the cache TTL, and the merge-write semantics is verified by reading the code against the same patterns this codebase's *other* Firestore-backed admin features already use successfully in production (pricing multipliers, seat briefs, conscience clause) — not by running it.

## Recommended testing checklist before this goes live
1. `pnpm install` then `pnpm --filter @workspace/api-server run typecheck` (or equivalent) — the real type-check I couldn't run here.
2. Run `scripts/build-release.py` or the Cloud Functions build directly and confirm it completes — the real build I couldn't run here.
3. In a sandbox Firebase project: open Admin → Credit Packs with no `config/creditPacks` document yet, confirm the three real packs (Starter/Pro/Mega) show up from the fallback.
4. Create a new test pack, confirm it appears on the **customer-facing** Billing page immediately (or within 60 seconds, the cache TTL).
5. Edit that pack's price, confirm a `GET /billing/products` call reflects the change within the same window.
6. Deactivate it, confirm it disappears from Billing but a direct `findCreditPackByPriceId` lookup (e.g. trigger an auto-refill against it, if you have an old reference) still resolves it rather than 404ing.
7. Try creating a pack with a duplicate id — confirm `409`. Try a price outside `$0.50–$1000` or a non-integer credit amount — confirm `400` with the bounds-specific message.
