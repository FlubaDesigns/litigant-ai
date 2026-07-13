# Litigant AI — Full Site Verification — Final Handoff
**Purpose:** Verifies `litigant-ai-full-site.zip` (updated) against every single finding from Audit Passes 1-9 and the prior consolidated fix-verification handoff. Every status below is verified directly against source — nothing inferred.

---

## Bottom line — corrected

**My original "one open item" claim was wrong.** A follow-up check caught four things I missed — one of them (the stale deployable bundle) is serious enough that it means two findings I called "fully resolved" are not actually resolved *in what would actually run in production*, even though the TypeScript source is genuinely fixed. I verified all four corrections directly against source below before accepting them.

**The most important lesson from this round:** "source fixed" and "deployed artifact fixed" are two different, separately-verifiable claims, and I only checked the first one. Going forward I'll check both.

---

## ✅ The build-breaker is resolved — and the source-level feature is complete

Previously: `Register.tsx` imported a `usePublicConfig` hook that didn't exist anywhere. Now verified:

- **`artifacts/gh-brain/src/hooks/usePublicConfig.ts`** exists, fetches from `getBillingDefaults()`.
- **`artifacts/api-server/src/lib/billingDefaultsConfig.ts`** now includes `signupBonusCredits` in its `BillingDefaults` interface, Firestore-backed (`config/billingDefaults`).
- **`artifacts/api-server/src/lib/creditLedger.ts`'s `grantSignupBonus()`** now reads `signupBonusCredits` from `getBillingDefaults()` at grant time.
- **All five previously-mismatched user-facing locations** now consistently use `usePublicConfig()`: `Landing.tsx` (5 instances), `ShareReport.tsx`, `ToolPage.tsx`, `ToolsIndex.tsx`, `LandingDemoPlayer.tsx`.
- **`emailService.ts`'s verification email** and **`brain.ts`'s guest-limit message** both now use the dynamic value instead of a hardcoded number.
- **`docs/credits.md`** updated to match.

**But — Finding A below means the admin panel can't actually change this value yet.** The read side is completely correct; the write side silently fails.

---

## ❌ Finding A — Admin Panel's Signup Bonus Field Is Silently Discarded by the Backend

**Priority: High.** Verified directly in `artifacts/api-server/src/routes/admin.ts`, the `PUT /admin/billing-defaults` route:

```ts
const { autoRefillAmounts, defaultAutoRefillAmount, defaultThresholdCredits, defaultWarningThresholdCredits } = req.body as {
  autoRefillAmounts?: number[];
  defaultAutoRefillAmount?: number;
  defaultThresholdCredits?: number;
  defaultWarningThresholdCredits?: number;
};
// signupBonusCredits is never destructured, never forwarded to saveBillingDefaults()
```

`Admin.tsx` sends `signupBonusCredits` in the save payload; this route silently drops it before calling `saveBillingDefaults()`. The save request still succeeds and returns the existing (unchanged) value, so the admin UI shows no error — it just quietly doesn't work. Right now the signup bonus is Firestore-readable, grant-time-configurable-if-you-edit-Firestore-by-hand, displayed as editable in Admin, but **not actually editable through the Admin UI**.

**Fix:**
```ts
const { autoRefillAmounts, defaultAutoRefillAmount, defaultThresholdCredits, defaultWarningThresholdCredits, signupBonusCredits } = req.body as {
  autoRefillAmounts?: number[];
  defaultAutoRefillAmount?: number;
  defaultThresholdCredits?: number;
  defaultWarningThresholdCredits?: number;
  signupBonusCredits?: number;
};
// ...
const updated = await saveBillingDefaults({
  ...(autoRefillAmounts !== undefined && { autoRefillAmounts }),
  ...(defaultAutoRefillAmount !== undefined && { defaultAutoRefillAmount }),
  ...(defaultThresholdCredits !== undefined && { defaultThresholdCredits }),
  ...(defaultWarningThresholdCredits !== undefined && { defaultWarningThresholdCredits }),
  ...(signupBonusCredits !== undefined && { signupBonusCredits }),
});
```
Also add server-side validation (integer, 0-100,000 or a tighter business-approved max) — the client-side `min`/`max` on the input are not a real integrity control.

**Until this is fixed, Findings 1/5/11 are not fully resolved** — the architecture is right, but the admin control it's supposed to enable doesn't work yet.

---

## ❌ Finding E — Same Route Has No Server-Side Validation On Any Field, Not Just the Missing One

**Priority: High.** Finding A (above) is `signupBonusCredits` being dropped entirely. This is broader: **none of the four fields this route already accepts are validated at all**, either on write or on read. Confirmed directly — the route destructures and forwards `autoRefillAmounts`, `defaultAutoRefillAmount`, `defaultThresholdCredits`, `defaultWarningThresholdCredits` with zero type/range checks, `saveBillingDefaults()` does a blind `{ ...current, ...updates }` merge straight to Firestore, and `getBillingDefaults()` does an equally blind `{ ...STATIC_DEFAULTS, ...data }` merge on read — nothing here rejects a malformed value or falls back to the static default if Firestore already contains garbage.

**This is a real outlier, not a hypothetical:** every other admin write route I've verified in this same file validates properly — `PUT /admin/pricing/:model` checks the multiplier is between 1–100, the credit-pack routes enforce `CREDIT_PACK_BOUNDS`, the ban endpoint checks `typeof banned !== "boolean"`. This route is the one place that pattern was skipped. The client-side `min`/`max` attributes on the Admin inputs are not a substitute — they don't stop a direct API call, a stale frontend build, or a future bug from writing `defaultAutoRefillAmount: -100` or `autoRefillAmounts: ["not-a-number"]` straight into the config every part of the billing system reads from, including (once Finding A is fixed) the actual signup bonus grant amount.

**Fix — both sides, not just the missing field:**
1. **Write-time validation** in the route, before calling `saveBillingDefaults()` — reject with `400` on anything that fails, don't silently coerce:
   - `autoRefillAmounts`: array of finite positive integers, each within the supported payment range (1–500 to match existing checkout bounds), no duplicates, non-empty.
   - `defaultAutoRefillAmount`: integer 1–500, and ideally must actually be a member of `autoRefillAmounts` (cross-field check — a default that isn't one of the offered options is its own bug).
   - `defaultThresholdCredits`, `defaultWarningThresholdCredits`: integers ≥ 0, with a sane upper bound.
   - `signupBonusCredits` (once Finding A adds it): integer, 0 to whatever max you're comfortable with.
2. **Read-time normalization** in `getBillingDefaults()` — don't trust `data` blindly. Validate each field pulled from Firestore and fall back to `STATIC_DEFAULTS` per-field if it's invalid, so a bad value that somehow got written (before this fix shipped, or by any future bug) doesn't propagate into the Billing page, auto-refill behavior, or the signup bonus the moment Finding A connects it.

**Do Findings A and E together, not sequentially** — adding `signupBonusCredits` to an unvalidated route just adds a fifth unvalidated field to persist. The route and the config loader should be hardened as one piece of work.

---

## ❌ Finding B — Deployable Cloud Run Bundle Is Stale (Critical)

**Priority: Critical.** This is the one that means "fixed in source" isn't the same as "fixed in production."

`firebase-functions/Dockerfile` copies and runs a **pre-built bundle**, not the TypeScript source: `COPY lib/ ./lib/` then `CMD ["node", "lib/server.mjs"]`. I checked that bundle directly:

- **`firebase-functions/lib/server.mjs`** still contains `verifyIdToken(idToken)` — no `checkRevoked` argument — and zero occurrences of `revokeRefreshTokens`. **Finding 19 (ban revocation) is fixed in source but not in the artifact that would actually deploy.**
- **`firebase-functions/lib/functions.mjs`** still contains the literal hardcoded string `"you'll receive 750 credits"` — the old guest-limit message, pre-dynamic-config. **Part of Finding 11 is fixed in source but not in this bundle.**
- The two bundle files have different modification timestamps, meaning they weren't even rebuilt together as a pair — confirming these are stale, inconsistently-regenerated artifacts, not a fresh build of current source.

**If this `firebase-functions/lib/` directory is what gets packaged into the actual Docker image, the currently-deployed behavior is the old, unfixed behavior for both of these**, regardless of what the TypeScript source says.

**Fix:** rebuild both `server.mjs` and `functions.mjs` from current source before this ships, and verify the output actually contains `verifyIdToken(idToken, true)`, `revokeRefreshTokens`, and the dynamic signup-bonus strings — don't hand-patch the bundle. Longer-term: add a build step that always regenerates these before Docker packaging, ideally one that fails CI if the generated bundle doesn't match current source.

**Until this is rebuilt and re-verified, Findings 11 and 19 cannot be marked resolved in the production artifact** — only in source.

---

## ⚠️ Finding C — Session.tsx Still Hard-Caps Two Displays at 4 Litigants

**Priority: Medium-High.** The backend genuinely supports 10 litigants now (verified), but `Session.tsx` has two leftover hardcoded limits that don't know that:

1. **Line 595**, cost estimate text: `Based on {Math.min(config.litigantCount, 4)} litigants{config.litigantCount > 4 ? \` of ${config.litigantCount} configured\` : ""}` — a 10-litigant session is described as *"Based on 4 litigants of 10 configured,"* which is now simply wrong; the estimator itself accounts for all configured litigants.
2. **Line 1541**, seat inspection list: `Array.from({ length: Math.min(state.config.litigantCount, 4) }, ...)` — litigants 5-10 never appear in the seat-assignment/inspection UI at all, even though they'll actually participate in the session.

**Fix:** replace both `4`s with `10` (or better, the already-loaded `maxLitigants` admin limit, so it never drifts again if that number changes):
```tsx
Based on {config.litigantCount} litigants, {config.debateMode} mode, ...
```
```tsx
Array.from({ length: Math.min(state.config.litigantCount, 10) }, ...)
```

**Until these two are fixed, Finding 4 is only partially resolved** — the engine and the persona set are right, but two parts of the UI still reflect the old 4-litigant architecture.

---

## ❌ Finding D — Firestore Session-Sharing Rule Still Open (confirmed, unchanged from prior handoff)

`firestore.rules` line 62 is unchanged: `allow read: if resource.data.shared == true;` — still grants full-document read via direct client SDK access to anyone with a shared session's raw doc ID, bypassing the field-allowlist `report.ts`/`sessions.ts` enforce at the Express layer.

**Sharper fix than I offered last time:** if the frontend never actually needs direct client-SDK reads of `/sessions/*` (i.e., it always goes through the Express routes, which the app appears to), the cleanest fix is closing client read access entirely:
```
match /sessions/{sessionId} {
  allow read, write: if false;
}
```
with all session access — owner and shared — handled server-side via the Admin SDK, which already bypasses rules entirely. If direct owner reads genuinely are needed somewhere, the narrower alternative is `allow read: if request.auth != null && request.auth.uid == resource.data.userId;` with no `shared`-based clause at all. Either way, don't keep the broad `shared == true` full-document rule on the theory that the Express layer redacts fields — direct SDK access skips that layer entirely.

---

## Small cleanup items, not blockers
- `authService.ts` line 20 and `billingService.ts` line 118 still say "100-credit"/"100 trial credits" in comments — cosmetic, non-user-facing.
- Any rebuild of the `firebase-functions/lib` bundle should be a full regeneration, not a manual patch of the specific stale strings — patching strings in a minified/bundled file risks missing other drift the same staleness implies.

---

## Corrected Final Summary

| Status | Item |
|---|---|
| ❌ Open | Firestore shared-session full-document read rule |
| ❌ Open | Admin signup-bonus field silently discarded by backend route |
| ❌ Open | Cloud Run/Firebase deployable bundle stale — revocation fix and dynamic signup bonus absent from what would actually deploy |
| ⚠️ Partial | Session.tsx still hard-caps two displays at 4 litigants despite 10-litigant backend support |
| ⚠️ Cosmetic | Two stale "100-credit" comments |
| ✅ Fixed in source | Guest IP handling (Finding 2) |
| ✅ Fixed in source, ⚠️ not yet in deployable bundle | Credit-cap pause/resume (Finding 6) — worth explicitly re-checking the bundle for this too, given Finding B; I only confirmed source |
| ✅ Fixed in source | Ten backend personas (engine + persona set) |
| ✅ Fixed in source | Deployment temp-file hardening (Finding 20) |
| ✅ Fixed in source | Auth redirect and password-reset flow fixes (Findings 12-14) |
| ✅ Fixed in source | Admin touch-target and destructive-action improvements (Findings 15, 17, 18) |
| ✅ Fixed in source, ❌ NOT in deployable bundle | Ban revocation (Finding 19) |
| ✅ Fixed in source, ❌ NOT in deployable bundle | Signup bonus dynamic config (Finding 11) |

**Highest-priority sequence:**
1. Fix the Admin billing-defaults route: add the missing `signupBonusCredits` field **and** add real server-side validation to all five fields plus read-time normalization, as one piece of work (Findings A + E together).
2. Rebuild `firebase-functions/lib/server.mjs` and `functions.mjs` from current source, and verify the output — don't assume a source fix means a deployed fix (Finding B). While rebuilding, also verify the pause/resume feature (Finding 6) actually made it into this bundle, since I haven't separately confirmed that one either.
3. Remove the two remaining 4-litigant caps in `Session.tsx` (Finding C).
4. Close the Firestore shared-session rule (Finding D).
5. Only after all four: run the actual production build and inspect the literal artifact that gets deployed, not the source tree.

---

## Reference — What Was Confirmed Correct in Source (unaffected by the corrections above)

- **Finding 6 (credit-cap pause/resume):** `brainEngine.ts` genuinely stops before the fixed pipeline on cap-hit, returns early with `pausedPrePipeline: true`, emits `type: "paused_pre_pipeline"`. `brain.ts` uses a dedicated smaller reservation for pipeline-only resumes. `useBrainSession.ts` and `Session.tsx` have a real pause card with a genuine cap-raise input. Reconciliation handled automatically, no special-casing needed. **Source-level, this is complete — but per Finding B, verify it's actually in the deployable bundle before treating it as shipped.**
- **Finding 4 (litigant personas):** `brainEngine.ts`'s `getRoles()` defines all 10 real personas now, not 4. **Per Finding C, the engine is right but two `Session.tsx` displays still don't reflect it.**
- **Finding 2 (guest IP bypass):** `brain.ts`'s `getClientIp()` now uses `req.ip` correctly.
- **Pass 5-9 findings (3, 12, 13, 14, 15, 17, 18, 19, 20):** all spot-checked present in source, no regressions from the earlier fix zip. **Per Finding B, Finding 19 specifically is not yet in the deployable bundle — source only.**

