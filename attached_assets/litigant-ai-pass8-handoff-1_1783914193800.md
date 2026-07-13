# Litigant AI — Backend Completion Audit — Pass 8 Handoff
**Scope:** Every remaining unaudited backend file: `rateLimiter.ts`, `firebaseAdmin.ts`, all five AI provider integrations (`openai.ts`, `anthropic.ts`, `grok.ts`, `gemini.ts`, `custom.ts`) plus `providers/index.ts` and `types.ts`, `seatBriefs.ts`, `conscienceConfig.ts`, `account.ts`, `health.ts`, `providers.ts`, `templates.ts`, both route aggregators (`index.ts`, `index-firebase.ts`), and the remainder of `emailService.ts`. **This completes 100% coverage of `artifacts/api-server/src`** — every file in the backend has now been read.
**Method:** Same standard throughout — every claim verified against actual source, exact file/line citations.

---

## Finding 19 — Bans Aren't Immediate: Already-Signed-In Users Keep Working for Up to ~1 Hour

**Priority: High.**

**Files:** `firebaseAdmin.ts` line 41 (`verifyIdToken`); `admin.ts` lines 338-377 (the ban endpoint, verified Pass 1).

**What's wrong:** `verifyIdToken` calls `getAuth().verifyIdToken(idToken)` without the `checkRevoked: true` option. The ban endpoint calls `getAuth().updateUser(uid, { disabled: banned })`, which blocks *new* sign-ins but does **not** invalidate ID tokens the user already holds — only `revokeRefreshTokens()` does that, and only when combined with revocation-checking on verify. I confirmed via a full-codebase grep that `banned` is referenced nowhere outside `admin.ts`'s own endpoint — no route (`brain.ts`, `billing.ts`, `sessions.ts`) independently checks the live `banned` field as a backstop.

**Net effect — stated precisely:** an already-authenticated user may continue accessing endpoints that rely solely on `verifyIdToken()` until their cached ID token expires naturally (~1 hour). That's what the code directly proves. I confirmed via full-codebase grep that no route checks the live `banned` field as a backstop, which supports the general pattern — but I want to be precise that this pass didn't independently re-audit every protected endpoint's complete authorization logic to prove each specific route (billing, sessions, etc.) has no other independent block I missed. The core issue — token verification alone doesn't check ban/revocation status, and nothing else does either as far as I found — is solid either way. For a feature whose entire purpose is stopping active abuse *now*, an up-to-an-hour gap in the authentication layer itself defeats a meaningful part of the point.

**Recommended fix — three layers, not just the two I originally proposed:**
1. **Ban flow:** call both `getAuth().updateUser(uid, { disabled: true })` *and* `getAuth().revokeRefreshTokens(uid)`.
2. **Shared verification helper:** change `verifyIdToken` to call the SDK with revocation-checking enabled (`verifyIdToken(idToken, true)` / the `checkRevoked` overload), so revoked tokens are actually rejected rather than accepted until natural expiry.
3. **Centralize the check, don't duplicate it:** add one authorization check immediately after successful token verification inside the shared helper itself — e.g. `if (decoded.disabled) throw unauthorized();` — rather than adding separate `banned` checks to `brain.ts`, `billing.ts`, `sessions.ts`, and every future route individually. A single source of truth in the shared auth layer means new endpoints can't accidentally ship without the check, which is a real risk if the fix is scattered across individual routes instead.

---

## Everything Else — Confirmed Clean, Full Backend Coverage

- **`rateLimiter.ts`:** solid. Firestore-transaction-based fixed-window counter, correctly atomic, genuinely global across Cloud Run instances (not per-container), with a logged in-memory fallback for local dev. This retroactively confirms the two password-reset rate limiters verified in Pass 1 rest on a sound mechanism.
- **`firebaseAdmin.ts`:** token verification itself is correct (proper signature/expiry/audience validation via the official SDK) aside from the revocation gap in Finding 19.
- **All five AI providers** (`openai.ts`, `anthropic.ts`, `grok.ts`, `gemini.ts`, `custom.ts`): consistently and correctly forward the `AbortSignal` into their respective SDK calls — I checked this directly rather than trusting the stale checklist claim that Anthropic didn't (it does, same as the others). `CustomProvider` has a nice defensive pattern: tries `stream_options` first for third-party endpoints, falls back gracefully if the endpoint rejects the unknown parameter.
- **`seatBriefs.ts`, `conscienceConfig.ts`:** clean, consistent Firestore-override-with-file-fallback pattern, matching the same good design already seen in `pricingConfig.ts` and `creditPacksConfig.ts`.
- **`account.ts`:** DELETE endpoint properly scoped to the authenticated user's own `uid` only, no cross-user risk. Minor, low-priority note: relies on the client to separately delete the Firebase Auth account after this call succeeds; if that second step never happens, a Firestore-less "ghost" Auth account could remain — not a security issue (re-provisioning works cleanly and the signup-bonus idempotency key survives, so no double-grant), just a loose end.
- **`health.ts`, `providers.ts`, `templates.ts`:** all clean. `providers.ts` even has a self-documenting comment referencing a previously-fixed sync-vs-async provider-detection bug, showing good practice.
- **`index.ts` / `index-firebase.ts`:** both route aggregators mount an identical set of routers — no missing or duplicated routes between the two entrypoints.
- **`emailService.ts`:** explicit, deliberate HTML-escaping of user-controlled `displayName` before interpolation into raw HTML email templates, with a comment explaining exactly why — real XSS prevention already in place. One tiny comment-accuracy nit (not a bug): the "still send" comment for password reset doesn't quite describe the actual mechanism (`generatePasswordResetLink` throws for unknown emails; the enumeration protection actually happens via the caller in `auth.ts` swallowing that throw, verified correct in Pass 1) — cosmetic only, the end-to-end behavior is safe.

---

## Status: Backend Fully Audited

Every file under `artifacts/api-server/src` has now been read across Passes 1, 2, 3, and 8. Remaining unaudited territory in the whole repo: the shared `lib/` packages (`api-client-react`, `api-zod`, `api-spec`, `db`), `firebase-functions/`, `scripts/`, and a handful of lower-priority frontend pieces flagged back in Pass 5 (legal pages, remaining shared components, rest of `Landing.tsx`). Let me know which of those you want next, or if you'd rather have a full consolidated summary of everything found across all 8 passes so far.
