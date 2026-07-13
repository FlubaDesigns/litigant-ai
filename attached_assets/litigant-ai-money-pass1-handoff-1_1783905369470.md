# Litigant AI — Money/Credits Audit — Pass 1 Handoff
**Scope:** Production paths only (Cloud Run via `app-firebase.ts` / `server-cloudrun.ts` / `functions.ts`). Dev-only `app.ts` entrypoint excluded per Dave's direction.
**Method:** Every finding below is verified against the actual source in `litigant-ai-full-site.zip`, with exact file + line citations. Nothing inferred or assumed. Where behavior couldn't be fully verified (e.g. live deployment config), it's marked as an open question, not a claim.
**Codebase snapshot:** as uploaded 2026-07-12.

---

## Summary Table

| # | Finding | File(s) / Line(s) | Money Impact | Status |
|---|---|---|---|---|
| 1 | Signup bonus: comments say 100 credits, code grants 750 | `creditLedger.ts` L15, L239-246; `auth.ts` L56; `billing.ts` L35 | **Direct** — every signup costs 7.5x what docs claim | Needs your decision |
| 2 | Guest one-free-session limit bypassable via spoofed header | `brain.ts` L81-85 | **Direct** — unlimited free AI sessions, real API cost, zero revenue | Confirmed bug, fix recommended |
| 3 | Admin bootstrap secret uses non-timing-safe comparison | `admin.ts` L100 | **Indirect** — theoretical path to admin, which controls `/admin/users/:uid/credits` (unbounded credit minting) | Confirmed inconsistency, low practical risk |
| 4 | Onboarding promises "no upper limit" litigants (up to 10); backend hard-caps at 4 | `OnboardingWizard.tsx` L36, L286; `brainEngine.ts` L48-56 | **Indirect** — credit reservation is estimated against the promised litigant count, refunded at reconciliation, but paying users get a smaller product than advertised | Confirmed bug, product decision needed |
| 5 | Primary credit documentation (`docs/credits.md`) also states 100, corroborating the mismatch and raising regression risk | `docs/credits.md` L208 | **Indirect** — regression risk: someone could "fix" code back to 100 using this doc as the source of truth | Confirmed, folds into Finding 1's decision |

**Confirmed solid, no action needed:** Square webhook signature verification (`squareEventHandler.ts`) is fail-closed, timing-safe, and has a defense-in-depth credit cap. `creditLedger.ts`'s `addCredits()` transaction is atomic and correctly the sole balance-mutation path. `reserveCredits`/`reconcileCredits` in `brain.ts` correctly use Firestore transactions and settle from real token counts, not client input.

---

## Finding 1 — Signup Bonus Amount Mismatch (100 vs 750)

**Files:**
- `artifacts/api-server/src/lib/creditLedger.ts`
  - Line 15 (type doc comment): `signup_bonus — 100 free credits on first verified login`
  - Lines 239-241 (function docstring): `Idempotently grants 750 trial credits to a new user on first sign-in.`
  - Line 246 (actual code): `addCredits(uid, 750, "signup_bonus", { source: "signup_trial", idempotencyKey: \`signup_bonus_${uid}\` })`
- `artifacts/api-server/src/routes/auth.ts` line 56 (comment): `Grants the 100-credit signup bonus`
- `artifacts/api-server/src/routes/billing.ts` line 35 (comment): `Idempotently grants 100 trial credits to a new user.`

**What's actually happening:** Every new user who provisions via `POST /auth/provision` or `POST /billing/signup-grant` receives **750 credits** ($7.50 of value at the fixed $0.01/credit rate), not 100. Three separate comments across two files still describe the old/intended value of 100.

**Why it matters:** This is a real unit-economics question, not a cosmetic doc drift. If 100 was the intended amount, you're giving away 7.5x too much per signup — at any meaningful signup volume this is a direct hit to margin. If 750 is the intended amount (e.g. a deliberate growth/acquisition decision), the comments are just stale and should be updated so nobody "fixes" it back to 100 by mistake later.

**Recommended action:** Confirm with Dave which number is correct, then:
- If 100 is correct: change `creditLedger.ts` line 246 to `addCredits(uid, 100, ...)`.
- If 750 is correct: update the three stale comments (`creditLedger.ts` L15, `auth.ts` L56, `billing.ts` L35) to say 750.
- Either way, update `docs/credits.md` §6 if it also references the wrong number (not yet checked in this pass).

---

## Finding 2 — Guest Free-Session Limit Bypassable via Spoofed Header

**File:** `artifacts/api-server/src/routes/brain.ts`, lines 81-85

```js
function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}
```

**What's wrong:** This takes the **leftmost** entry of the `X-Forwarded-For` header. In the standard `client, proxy1, proxy2` format, the leftmost entry is the original client-supplied value — which is exactly the part an attacker controls. Anyone can send `X-Forwarded-For: <random-string>` on every request and get treated as a brand-new, never-used IP each time, defeating the "one free guest session per IP" gate entirely (enforced via `hasGuestUsed()` / `markGuestUsed()`, same file, lines 87-113, which key off this same function).

**Why this is provably the wrong pattern (not just a style nitpick):** `app-firebase.ts` already sets `app.set("trust proxy", 1)` specifically so Express can safely resolve the real client IP through `req.ip`. This exact safe pattern is already used correctly elsewhere in the same codebase — `auth.ts`'s rate limiters key on `req.ip` (e.g. `resetByIpLimiter`, `verifyByIpLimiter`). `getClientIp()` in `brain.ts` reinvents IP resolution instead of using `req.ip`, and gets the trusted/untrusted segment backwards.

**Money impact:** Unlimited free AI sessions for unauthenticated users. Every guest session still calls real AI provider APIs (real cost to you), with zero revenue and zero rate limit once this header is spoofed.

**Recommended fix:**
```js
function getClientIp(req: import("express").Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
```
This relies on Express's own `trust proxy`-aware resolution (already configured correctly in `app-firebase.ts`), consistent with how `auth.ts` already does it.

---

## Finding 3 — Admin Bootstrap Secret: Non-Timing-Safe Comparison

**File:** `artifacts/api-server/src/routes/admin.ts`, line 100

```js
if (secret !== masterSecret) {
  return res.status(403).json({ error: "Invalid master secret" });
}
```

**What's wrong:** Plain string comparison of `ADMIN_MASTER_SECRET` — the credential that grants the `admin: true` custom claim (full control of `/admin/*`, including `POST /admin/users/:uid/credits`, which mints credits with no upper bound per request).

**Why this is worth fixing even though it's low-probability:** The codebase is otherwise deliberate about this exact class of vulnerability. `squareEventHandler.ts`'s `verifySquareWebhook()` explicitly uses `crypto.timingSafeEqual()` and documents why in a comment: *"Credits are minted from this endpoint... an unverified webhook is an open door to free credits."* The admin secret is arguably higher-stakes than the webhook signature (it grants full admin, not just one credit grant), and doesn't get the same treatment. Real-world HTTP timing attacks are hard but not theoretical — Anthropic/security literature generally treats this as a should-fix, not a must-fix-today, given network jitter makes it impractical for most attackers. Flagging as a defense-in-depth gap for consistency, not an active exploit.

**Recommended fix:**
```js
import crypto from "crypto";
// ...
const secretBuf = Buffer.from(secret ?? "");
const masterBuf = Buffer.from(masterSecret);
const valid = secretBuf.length === masterBuf.length && crypto.timingSafeEqual(secretBuf, masterBuf);
if (!valid) {
  return res.status(403).json({ error: "Invalid master secret" });
}
```

---

## Finding 4 — "No Upper Limit" Litigant Count Is False (Hard-Capped at 4)

**Files:**
- `artifacts/gh-brain/src/components/OnboardingWizard.tsx`
  - Line 36: `const ALL_LITIGANT_COUNTS = [2, 3, 4, 5, 6, 8, 10];`
  - Line 286: `Selected: {prefs.litigantCount} litigants — no upper limit, the more you choose the more comprehensive the analysis.`
- `artifacts/api-server/src/lib/brainEngine.ts`
  - Lines 48-56 (`getRoles()`): only 4 personas exist (Advocate, Skeptic, Devil's Advocate, Empiricist) — `roles.slice(0, Math.min(config.litigantCount, roles.length))` silently caps at 4.
  - Line 246: `const roles = getRoles(config);` — confirmed sole call site, no alternate persona-generation path exists for counts above 4 (verified via full-file grep, no other `RoleDefinition[]` construction anywhere in the file).

**What's wrong:** A user can select 5, 6, 8, or 10 litigants in onboarding, and the UI explicitly tells them there's no cap and more litigants means deeper analysis. The backend silently runs only 4 regardless of what was selected — no error, no warning, no adjusted UI state.

**Money impact:** Indirect but real. `estimateSessionCredits()` (in `creditEngine.ts`, via `variableTokens()`) builds the *pre-run reservation estimate* using the full requested `litigantCount` (capped at 10, not 4) — so a user selecting 10 litigants gets a much larger credit hold placed on their account than the session will actually use. `reconcileCredits()` in `brain.ts` correctly refunds the difference based on real token counts, so no credits are permanently overcharged — but the user experiences a much larger temporary hold than necessary, and more importantly, pays for and expects a 10-litigant debate and silently receives a 4-litigant one.

**Recommended action (product decision, not just a code fix):** Either:
- (a) Cap the onboarding/config UI at 4 to match reality, or
- (b) Build out additional litigant personas in `getRoles()` to actually support up to 10.
This is a product call, not something to silently patch — flagging for Dave's decision on which direction to go before Rep implements anything.

---

## Finding 5 — Primary Credit Documentation Also Advertises the Wrong Signup Bonus

**Priority:** Low on its own (documentation), but raises the stakes on Finding 1 — this is no longer just stray code comments.

**File:** `artifacts/api-server/docs/credits.md`, line 208:
```
| Signup bonus        | `signup_bonus`        | First login after email verification (100 credits, idempotent) |
```

**What this changes:** This is the file `creditLedger.ts`'s own header comment points to as *"the full transaction type reference"* (see `creditLedger.ts` line 25: `See docs/credits.md §6 for the full transaction type reference.`). So the mismatch isn't confined to inline code comments anymore — it's in the document that's supposed to be the authoritative source of truth for the whole credit system. Four separate places now say 100 (`creditLedger.ts` L15, `auth.ts` L56, `billing.ts` L35, `docs/credits.md` L208) against one place that actually grants 750 (`creditLedger.ts` L246).

**Risk:**
- A future developer (or Rep, working from this doc) could "fix" the code back to 100 because the documentation looks authoritative — silently cutting the signup bonus by 7.5x with no one deciding that on purpose.
- Support/QA could quote 100 credits to a user who actually received 750.
- Any future pricing or revenue audit starts from a wrong baseline.

**Recommendation:** Once Dave decides whether 100 or 750 is correct, fix all five references in one commit, not piecemeal:
- `creditLedger.ts` line 15 (comment)
- `creditLedger.ts` line 239-241 (docstring) and/or line 246 (code, if 100 is correct)
- `auth.ts` line 56 (comment)
- `billing.ts` line 35 (comment)
- `docs/credits.md` line 208
- Any onboarding/help text surfaced to users that references the signup amount (not yet checked — worth a grep across `gh-brain/src` for "100 credit" / "signup bonus" once the number is decided)

---

## Open Questions for Dave

1. **Finding 1 / Finding 5:** Is 100 or 750 the intended signup bonus? This now blocks a five-file fix, not a three-file one.
2. **Finding 4:** Cap the UI at 4, or build out more personas? (Blocks the fix.)

## Not Yet Audited (queued for next pass)
- Rest of `brainEngine.ts` (rebuttal chain, credit-cap pause logic, streaming) — money-adjacent (pause-on-credit-cap logic directly gates spend).
- `pricingConfig.ts` (live admin-overridable multiplier) — not yet read this pass.
- `creditPacksConfig.ts` / admin credit pack CRUD — bounds-checked briefly via `CREDIT_PACK_BOUNDS` import in `admin.ts`, not yet verified in detail.
- Frontend billing UI (`Billing.tsx`) — not yet checked for how it surfaces auto-refill / checkout URLs client-side.
- Onboarding/help text elsewhere in `gh-brain/src` that may also reference the signup bonus number (grep not yet run — do this once Finding 1/5 is resolved, so the fix commit is complete in one pass).
