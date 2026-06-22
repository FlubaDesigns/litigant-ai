# Litigant AI — Audit Handoff, Pass 4 of N
**Scope of this pass:** `artifacts/api-server/src/routes/auth.ts`, `account.ts`, `billing.ts`. First pass into the route layer — `lib/` is fully covered as of Pass 3. Started here deliberately: identity and money are the highest-stakes route files.

Two findings in this pass (#11, #12) required tracing values from `billing.ts` through into files already covered in earlier passes — `brainEngine.ts` and `creditLedger.ts` (Pass 1/Pass 2) and specific lines of `brain.ts` (Pass 1) and the frontend (`Session.tsx`, `OnboardingWizard.tsx`, and a few related files, checked only for the specific lines relevant to those findings, not read in full). That's noted inline in each finding rather than expanding this pass's formal scope.

**Status:** Not yet read in full: `admin.ts`, `health.ts`, `providers.ts`, `report.ts`, `sessions.ts`, `templates.ts`, `webhook.ts` (its one relevant call site was checked in the Pass 3 addendum exchange), and `brain.ts` (covered for credit-reservation logic in Pass 1 and the auto-refill call site in this pass, but not end-to-end). After routes: the entire frontend.

---

## Finding #9 — Password reset endpoint's "don't reveal whether the email exists" comment isn't backed by the actual error handling

**Severity: Medium. Confirmed at the code level; the exploitability claim depends on Firebase Admin SDK behavior I can't execute in this sandbox to verify directly — flagged with that caveat below.**

### Where
`artifacts/api-server/src/routes/auth.ts`, `POST /auth/send-password-reset`, combined with `artifacts/api-server/src/lib/emailService.ts`'s `sendPasswordResetEmail()`.

### What I can confirm directly from the code
```ts
router.post("/auth/send-password-reset", async (req, res) => {
  const { email } = (req.body ?? {}) as { email?: string };
  ...
  try {
    await sendPasswordResetEmail(email.trim().toLowerCase());
    // Always return success — don't reveal whether the email exists
    return res.json({ sent: true });
  } catch (err: any) {
    console.error("[Auth] send-password-reset error:", err.message);
    return res.status(500).json({ error: "Failed to send password reset email" });
  }
});
```
There is no special-casing of any error type in this catch block. Every possible failure — a nonexistent account, Resend being down, a malformed email, anything — falls into the same generic `500` response. The comment describes the *intent* correctly (always look the same regardless of whether the email exists), but the code only guarantees that on the **success** path. The failure path is wide open to whatever distinguishing behavior the underlying calls happen to have.

Inside `emailService.ts`:
```ts
export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  const link = await getAuth().generatePasswordResetLink(email, {
    url: `${APP_URL}/login?reset=1`,
  });
  ...
```
`generatePasswordResetLink` is called unconditionally, before any existence check.

### What I believe is true but can't execute to confirm
The Firebase Admin SDK's `generatePasswordResetLink()` is documented (per my training knowledge — I don't have SDK source or network access in this sandbox to verify against the live docs) to require the email correspond to an existing user, and to throw an `auth/user-not-found` error if it doesn't — because the function needs to bind the generated link to a real user record. If that's accurate, the consequence is direct: a request for a registered email completes the full round-trip (link generation + an actual outbound Resend API call + a 200 with `{ sent: true }`), while a request for an unregistered email throws immediately at the link-generation step and returns a `500` with a different body — and very likely a measurably faster response, since no outbound email API call happens on that path. That's a status-code, body, and (most likely) timing side-channel all pointing the same direction: an attacker submitting a list of candidate emails to this endpoint could determine which ones have real accounts, which is exactly what the comment says this code is trying to prevent.

### What I'd want before fixing this
The fix itself isn't complicated — catch `auth/user-not-found` specifically (or any error, treating "user not found" the same as "sent successfully") and return the identical `{ sent: true }` response regardless, so the uniform-response guarantee actually covers the failure path the same way it covers the success path. I haven't made this change because I'd like you (or whoever has access to a real Firebase project) to confirm the underlying SDK behavior first — if I'm wrong about `generatePasswordResetLink` throwing on a nonexistent user, this finding evaporates entirely, and I don't want to ship a fix for a problem that might not exist. A two-minute test against any Firebase project (call the function with an email you know doesn't have an account, see what happens) would settle this conclusively.

---

## Finding #10 — Square checkout redirect URL is built from a client-controllable header

**Severity: Low. Real anti-pattern; narrow practical exploitability.**

### Where
`artifacts/api-server/src/routes/billing.ts`, both `POST /billing/checkout` and `POST /billing/checkout/custom` — identical pattern in each:
```ts
const origin =
  (req.headers["origin"] as string | undefined) ||
  (process.env["APP_DOMAIN"] ? `https://${process.env["APP_DOMAIN"]}` : null) ||
  `https://${(process.env["REPLIT_DOMAINS"] as string | undefined)?.split(",")[0]}`;
...
redirectUrl: `${origin}/billing?success=true`,
```

### What's broken
`req.headers["origin"]` is the first item in this fallback chain, and it's a plain HTTP header — a real browser sets it automatically to match the page's actual origin, but a raw HTTP request (anything that isn't a browser enforcing same-origin behavior, e.g. a direct API call) can set it to anything. The value flows straight into the Square Payment Link's `redirect_url`, which is where Square sends the browser after the hosted checkout completes.

### Why this is real but narrow
I traced the actual blast radius before flagging severity: this requires a valid Bearer token to reach the endpoint at all (both checkout routes call `requireAuth` first), so this isn't something an outside attacker can trigger against a victim without already having that victim's credentials — there's no unauthenticated or simple-link-click path here (this is an authenticated POST, not a GET-based flow vulnerable to a crafted link). The redirect also has no bearing on the actual payment or credit grant, both of which happen through Square's real checkout and the server-side webhook respectively, entirely independent of this URL. So the practical exploit value of forging your own post-payment redirect destination is low. I'm flagging it anyway because trusting a client-supplied header for a redirect URL is a known anti-pattern regardless of immediate exploitability — it's the kind of thing that becomes a real problem if this code is ever copied into a context with a different trust boundary (e.g. if `redirectUrl` is ever reused for anything besides cosmetic post-payment navigation).

### What I'd want before fixing this
Straightforward: drop `req.headers["origin"]` from the fallback chain entirely and rely only on `APP_DOMAIN` / `REPLIT_DOMAINS`, which are both server-controlled environment values, not client input. I haven't made this change because it's a small, low-risk edit I'd rather batch with other route-layer cleanup from this same pass rather than ship as a single-line diff on its own — happy to do it now if you'd rather not wait.

---

## Finding #11 — Configured litigant count silently exceeds what the engine executes, with no indication to the user

**Severity: Medium. Not a security or billing issue — a product-trust issue, confirmed live in this codebase.**

**Note on origin:** this finding revisits something I'd previously recommended fixing differently — in an earlier, separate conversation (a different uploaded zip, before this from-scratch audit arc started), I suggested capping the UI's selectable litigant count down to 4 to match the engine's actual persona limit per court mode. That recommendation was reconsidered, and the reconsideration is right: I was solving for internal consistency at the cost of foreclosing legitimate future growth (more personas per mode, custom user-defined litigants, expert-witness-style specialist seats) that the existing `1-10` range may well have been deliberately sized for. Capping the *stored config range* would lock the architecture to today's implementation rather than leaving room for tomorrow's. The better fix targets the actual defect — the silent mismatch — not the range that allows for one. I hadn't carried that earlier finding into Passes 1-4 of this current arc at all (it was never in scope for `lib/`, `auth.ts`, `account.ts`, or `billing.ts`), so this is the first time it's actually being written up against this zip.

### Where
`artifacts/api-server/src/lib/brainEngine.ts`, `getRoles()`, combined with `artifacts/api-server/src/routes/auth.ts`'s validation range and `artifacts/gh-brain/src/pages/app/Session.tsx`'s UI.

### What's actually happening, confirmed against this zip
`auth.ts`'s `PATCH /auth/preferences` validates and persists `litigantCount` up to 10:
```ts
if (typeof ds.litigantCount === "number" && ds.litigantCount >= 2 && ds.litigantCount <= 10)
  patch["defaultSettings.litigantCount"] = ds.litigantCount;
```
`Session.tsx`'s in-session counter matches that same ceiling:
```ts
const next = Math.min(state.config.litigantCount + 1, 10);
```
But `brainEngine.ts`'s `getRoles()` only ever returns up to 4 role definitions per court mode — `allRoles.length` is a fixed array of exactly 4 personas, and `Math.min(config.litigantCount, allRoles.length)` means any value above 4 is silently clamped at execution time, with no signal anywhere that this happened.

The UI doesn't just allow the mismatch — it actively invites a user to invest real effort into a configuration that won't fully execute. `Session.tsx` displays the raw configured number with no caveat (`{state.config.litigantCount} litigants`), and both the runtime config panel and the seat-inspector build a full seat-assignment UI sized to the configured count via `makeDefaultSeatMap(state.config.litigantCount)` — meaning a user who sets the count to 10 and then goes seat-by-seat assigning specific AI providers/models to "Litigant 7," "Litigant 8," etc. is configuring seats that will never run, with the product never telling them so.

### Why the range itself isn't the problem
I checked the credit-estimation side specifically to confirm this isn't also a billing issue: `creditEngine.ts`'s `estimateSessionCredits()` independently clamps with the same `Math.min(config.litigantCount, 4)` logic, so a user configuring 10 litigants is never overcharged for the 6 that won't execute — billing and execution agree with each other; only the *UI's representation of what's about to happen* is out of sync with both. That makes this purely a communication problem, not a money problem, which is consistent with treating the fix as "tell the truth about what ran" rather than "shrink what's allowed."

### Decision
The litigant count ceiling stays at **10** — no change to the validated range in `auth.ts` or the UI's counter limit in `Session.tsx`. The fix here is to stop the silent mismatch, not to shrink the range: surface to the user, wherever the count is configured and wherever seats are displayed, that the active engine currently executes up to 4 distinct personas per court mode regardless of a higher configured count. That keeps the door open for the engine to grow into the full range later without requiring another config migration, while no longer letting someone configure six seats that quietly do nothing.

---

## Finding #12 — Auto-refill preferences are stored with no validation on `thresholdCredits` or `packPriceId`

**Severity: Medium. Confirmed and traced end-to-end through both files that consume these values — not a security issue, a billing-integrity gap.**

### Where
`artifacts/api-server/src/routes/billing.ts`, `PATCH /billing/auto-refill`:
```ts
router.patch("/billing/auto-refill", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { enabled, thresholdCredits, packPriceId } = req.body as {
    enabled?: boolean;
    thresholdCredits?: number;
    packPriceId?: string;
  };

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  await setAutoRefillPreference(user.uid, {
    enabled,
    thresholdCredits: thresholdCredits ?? 20,
    packPriceId: packPriceId ?? "starter_pack",
  });

  return res.json({ success: true });
});
```

### What's broken
`enabled` is the only field actually validated — a type check, nothing more. `thresholdCredits` and `packPriceId` both pass straight through with nothing beyond a default applied when the field is missing entirely: no range check on the number, no lookup confirming the price ID corresponds to a real product. A request body of `{ enabled: true, thresholdCredits: -500, packPriceId: "whatever-i-want" }` is accepted exactly as sent and written to Firestore.

This stands out specifically because it's inconsistent with the rest of the same file: `POST /billing/checkout` validates `priceId` against the real `CREDIT_PACKS` table before doing anything with it; `POST /billing/checkout/custom` range-checks `dollars` (`1-500`) before computing anything from it. Both of those were verified clean earlier in this same pass. This endpoint, three functions later in the identical file, holds its inputs to no such standard.

### Traced through to two concrete, non-theoretical failure modes
I followed both fields to where they're actually read, not just where they're written. `creditLedger.ts`'s `checkAndTriggerAutoRefill()` (audited in Pass 2):
```ts
if (!autoRefill?.enabled)                      return;
if (newBalance >= autoRefill.thresholdCredits) return; // still above threshold
const url = await createCheckoutUrl(autoRefill.packPriceId, uid);
if (!url) return;
```
and `brain.ts`'s `createAutoRefillUrl()`, the concrete `createCheckoutUrl` implementation passed into the call above:
```ts
async function createAutoRefillUrl(priceId: string, uid: string): Promise<string | null> {
  if (!isSquareConfigured()) return null;
  const found = findPackByPriceId(priceId);
  if (!found) return null;
  ...
```
Neither bad value crashes anything or corrupts data — both just make the feature silently do the wrong thing:
- **`packPriceId` doesn't match a real pack** → `findPackByPriceId` returns `null` → `createAutoRefillUrl` returns `null` → `checkAndTriggerAutoRefill` returns early at `if (!url) return;`. The user has auto-refill switched on in their settings, believes they're protected from running out of credits mid-session, and it will never fire — with nothing surfacing this anywhere. `brain.ts`'s own call site wraps this in a non-fatal catch, so even a thrown error wouldn't reach the user; a silent `null` return doesn't even get that far.
- **`thresholdCredits` set absurdly high** (e.g. `999999999`) → `newBalance >= autoRefill.thresholdCredits` evaluates false on essentially every balance check → the refill condition is satisfied on every single session, repeatedly generating Square payment links the user never asked for at that frequency. This doesn't charge anything by itself — these are unrequested checkout links, not completed payments — but it's a real nuisance and unnecessary load: repeated outbound Square API calls and Firestore writes for no benefit to anyone.
- **`thresholdCredits` set negative** (e.g. `-500`) → the mirror-image failure: `newBalance >= -500` is true for any realistic balance, so the refill condition is never satisfied. Same silent-no-op outcome as the bad-pack-ID case, reached through the other field instead.

### Why this matters
The practical harm is a false sense of safety: a feature whose entire purpose is "don't let me run out of credits mid-session" can be made to silently do nothing by a malformed value in either field, with no error, no warning, and no way for the user to discover this short of actually running out of credits and being surprised that the safety net they turned on didn't catch them.

### The fix
```ts
import { CREDIT_PACKS, CREDITS_PER_DOLLAR, findPackByPriceId } from "../lib/creditPacks.js";
// findPackByPriceId isn't currently imported in this file — CREDIT_PACKS and
// CREDITS_PER_DOLLAR are; this adds the one more name needed.

router.patch("/billing/auto-refill", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { enabled, thresholdCredits, packPriceId } = req.body as {
    enabled?: boolean;
    thresholdCredits?: number;
    packPriceId?: string;
  };

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  if (typeof thresholdCredits !== "undefined") {
    if (typeof thresholdCredits !== "number" || thresholdCredits < 10 || thresholdCredits > 100_000) {
      return res.status(400).json({ error: "thresholdCredits must be a number between 10 and 100,000" });
    }
  }

  if (typeof packPriceId !== "undefined") {
    if (!findPackByPriceId(packPriceId)) {
      return res.status(400).json({ error: "packPriceId must match a real credit pack" });
    }
  }

  await setAutoRefillPreference(user.uid, {
    enabled,
    thresholdCredits: thresholdCredits ?? 20,
    packPriceId: packPriceId ?? "starter_pack",
  });

  return res.json({ success: true });
});
```
I deliberately reused `findPackByPriceId` — the exact same lookup `createAutoRefillUrl` already calls downstream — rather than writing a second, separate way of checking "is this a real pack ID." This codebase already has two recurring instances of a constant or check being duplicated in two places and drifting (Pass 2's Finding #5, the admin pricing table's stale session assumption; Pass 3's Finding #8, the duplicated default-model map) — reusing the existing function here avoids adding a third.

The `10` / `100,000` bounds on `thresholdCredits` are a reasonable starting range, not a number derived from anything authoritative — happy to adjust if you have a different sense of what's sane for this field.

I haven't applied this edit yet. It's money-adjacent code in a file you may want to review once before it changes, and unlike Finding #11 there's no open product question blocking it — it's ready to ship as soon as you say go.

---

- **`auth.ts`'s `POST /auth/provision`** — `creditBalance: 0` is set explicitly at user-document creation, with the actual 100-credit signup bonus granted separately through `grantSignupBonus()`'s idempotent ledger call. The client has no path to influence its own starting balance. Both `role` and the rest of the optional profile fields are whitelisted/sanitized (`VALID_ROLES` set, `organization` length-capped) before being written.
- **`auth.ts`'s `PATCH /auth/preferences`** — every field is validated against an explicit allowed-values set (`VALID_COURT_MODES`, `VALID_RESP_MODES`, `VALID_OUT_FORMATS`, `VALID_PROVIDERS`) or a numeric range before being included in the Firestore patch; anything invalid is silently dropped rather than written, which is the correct behavior for an optional-fields PATCH endpoint.
- **`account.ts`'s `DELETE /account`** — every Firestore query (`sessions`, `feedback`) filters by `userId === uid` from the verified token; no path exists for deleting another user's data. Deletion order (sessions + subcollections → feedback → user profile) is sound.
- **`billing.ts`'s checkout flow, both fixed-pack and custom-amount paths** — this was the specific thing deferred from Pass 3 (does the payment-note construction trust client input). It doesn't: `POST /billing/checkout` looks up `creditAmount` from the server's own `CREDIT_PACKS` table by `priceId`, never from the client; `POST /billing/checkout/custom` computes `amountCents`/`creditAmount` directly from a server-validated, range-checked `dollars` value. Confirms the full chain from client request through Square charge through webhook credit-grant (audited in Pass 3) is sound end-to-end — no gap anywhere in it.
- **`creditPacks.ts`** — re-verified the "10% bonus" / "20% bonus" descriptive text against the actual unit_amount/creditAmount math for all three packs; the percentages are accurate, not just marketing copy.

---

## Flagged for a decision, not a bug — `credit_transactions` / `payment_events` survive account deletion

`account.ts`'s `DELETE /account` removes `sessions`, `session_turns`, `feedback`, and the user profile document — but never touches `credit_transactions` or `payment_events`, both of which carry the deleted user's `uid` on every document. This may well be intentional: retaining financial/transaction records after account deletion for accounting, tax, or fraud-investigation purposes is standard practice, and most "right to deletion" frameworks (including GDPR's actual text) carve out exceptions for exactly this kind of record. I can't determine intent from the code alone, so I'm not calling this a defect — just flagging that if "delete my account" is meant to be interpreted as "delete everything, no exceptions" in your privacy policy or terms of service, this doesn't currently do that, and you'd want to either update that copy to reflect the carve-out or add deletion/anonymization logic for those collections.

---

## Where to pick this up next
Remaining routes: `admin.ts` (the largest remaining file by a wide margin — admin user management, credit adjustments, the pricing/seat-brief override endpoints referenced in Passes 1-3), `sessions.ts`, `report.ts`, `templates.ts`, `providers.ts`, `health.ts`, and a full read of `webhook.ts` and `brain.ts` (both partially covered already, in Pass 3's addendum exchange and Pass 1 respectively, but neither read end-to-end against everything they do). Given `admin.ts`'s likely size, I'd suggest it gets its own pass rather than being bundled with the smaller files.

One scope note: investigating Finding #11 above required checking a few specific lines in `Session.tsx`, `OnboardingWizard.tsx`, `SeatInspector.tsx`, `CourtDiagram.tsx`, and `seatTypes.ts` — none of those are read in full yet, only the lines relevant to the litigant-count mismatch. The frontend still gets its own proper pass later; treat this as a targeted exception, not early frontend coverage.
