# Litigant AI — Audit Handoff, Pass 8 of N
**Scope of this pass:** `Billing.tsx` (full), `Session.tsx` (the litigant-role-detection and dialog-rendering logic specifically — not yet a full line-by-line read of all 1719 lines, see note below), `History.tsx` (export and deletion flows), and the remaining lower-stakes sections of `Settings.tsx` (data export — preferences/notifications sections weren't reached this pass either, see note).

**Status:** This pass did not fully exhaust `Session.tsx` — at 1719 lines it's the largest file in the frontend, and the litigant-role bug found early in it was substantial enough to warrant writing up properly rather than rushing the remaining ~1100 lines in the same pass. Not yet read in this file: the SSE-handling logic, the config panel's full interaction surface, the rebuttal-submission UI, and the artifact-rendering components. Also not yet read: `Settings.tsx`'s preferences/notifications sections specifically (only the security-sensitive parts from Pass 7 and the data-export handler from this pass have been read).

**Revision:** Finding #25 was raised from Medium to Medium-High after review surfaced a real path I'd missed in the original version — I'd found the unreachable *consequence* of an already-active Pro subscription, but missed a separate, always-reachable fallback that puts a real "Upgrade to Pro" button in front of every visitor and 404s the instant it's clicked. Re-verified that specific chain directly rather than taking the correction at face value — see the revised finding for the trace.

---

## Finding #24 — Every real litigant turn is misidentified as a non-litigant turn throughout `Session.tsx`'s live rendering

**Severity: Medium-high. Confirmed, affects every session's visual presentation, and disables an entire UI component outright.**

### Where
`artifacts/gh-brain/src/pages/app/Session.tsx`:
```ts
function isLitigantRole(role: string) {
  return role.toLowerCase().startsWith("litigant");
}
function isOrchestratorRole(role: string) {
  return role === "Orchestrator" || role === "Verdict" || role === "Moderator";
}
```

### What's broken
`isLitigantRole` checks whether a role name starts with the literal substring `"litigant"`. I checked every real persona name `brainEngine.ts` actually produces across all four court modes — 16 distinct names total (`Advocate`, `Skeptic`, `Devil's Advocate`, `Empiricist`, `Questioner`, `Defender`, `Synthesizer`, `Logician`, `Analyst`, `Contrarian`, `Realist`, `Futurist`, `Critic`, `Defender` again, `Balanced Reviewer`, `Standards Expert`) — and none of them start with "litigant." The function as written can never return `true` for a real litigant turn in any session, in any mode.

### Two concrete, traced consequences

**1. The entire `LitigantVoicesBox` component never renders, for any session, ever:**
```ts
{state.runtimeFeed.some((f) => isLitigantRole(f.role)) && (
  <LitigantVoicesBox items={state.runtimeFeed.filter((f) => isLitigantRole(f.role))} ... />
)}
```
`.some(...)` over real session data always evaluates `false`, so this component — built, styled, and clearly intended to be a real part of the product ("shown only in All Voices mode," per its own preceding comment) — is permanently dead in production.

**2. Every litigant's dialog line gets the wrong styling and can have its content silently corrupted:**
```ts
function DialogLine({ item, adversarial }: { item: FeedItem; adversarial?: boolean }) {
  const isYou = item.role === "You";
  const isLit = isLitigantRole(item.role);
  ...
  } else if (isLit) {
    // never reached for a real litigant turn
  } else {
    // Orchestrator / Moderator / Verdict — but every real litigant turn lands here too
  }
  ...
  if (!isYou && !isLit && body.startsWith("[")) {
    // strips what it assumes is a "[Seat | Model | …]" disclosure header
  }
  ...
  const speakerLabel = `${item.role}${isLit && adversarial ? " ⚔" : ""}...`; // sword never shows
```
Since `isLit` is always `false` for real litigants, every litigant turn renders with the same border color and background intended for Orchestrator/Moderator/Verdict turns (the comment on the `else` branch literally says `// Orchestrator / Moderator / Verdict`, confirming this wasn't the intended behavior), the adversarial sword emoji never appears for anyone, and — the part with a real content-correctness consequence — the disclosure-header-stripping check (`!isYou && !isLit && body.startsWith("[")`) runs on litigant content when it's supposed to be excluded from it. If a litigant's actual generated argument happens to start with a `[` character (plausible for AI-generated text — a bracketed citation, aside, or stage direction), this code will mistake the first line for a `[Seat | Model | …]` disclosure tag and silently cut it from what's displayed.

### What I'd want before fixing this
This needs the same fix shape as Pass 6's Finding #16/#18 — define non-litigant roles by exclusion rather than trying to pattern-match litigant roles by a naming convention the engine never adopted:
```ts
const NON_LITIGANT_ROLES = new Set(["Orchestrator", "Moderator", "Architect", "Builder", "Auditor", "Verdict"]);
function isLitigantRole(role: string) {
  return role !== "You" && !NON_LITIGANT_ROLES.has(role);
}
```
I haven't applied this yet, but I'd flag it alongside Pass 6's role-list findings rather than as an isolated frontend fix — this is now the third place in the codebase needing the same canonical "which roles aren't litigants" list (`report.ts` twice, now here), which strengthens the case for defining it once, likely exported from wherever the persona names themselves are defined, rather than continuing to hand-write it per file.

---

## Finding #25 — `Billing.tsx` has a live, clickable Pro subscription purchase path that always 404s — plus a second, separately-dead Pro UI state

**Severity: Medium-High (revised up from Medium). The addendum that reviewed this found something I missed: I'd traced the *unreachable* consequence of an active subscription, but missed a second, completely separate path that's reachable by every single visitor and ends in a real checkout failure.**

### The part I missed, found by review, then re-verified directly
`Billing.tsx` has a fallback array that activates whenever the real subscription product list is empty:
```ts
const subscriptionProducts = products.filter(
  (p) => p.metadata?.type === "subscription" || p.prices[0]?.recurring
);
...
{!isProActive && (
  ...
  {(subscriptionProducts.length > 0 ? subscriptionProducts : FALLBACK_SUBSCRIPTION).map((product) => (
    <ProductCard product={product} onBuy={handleBuy} ... />
  ))}
)}
...
const FALLBACK_SUBSCRIPTION: BillingProduct[] = [
  { id: "price_pro_monthly", product: "pro_subscription", unit_amount: 2900, currency: "usd",
    recurring: { interval: "month", interval_count: 1 }, active: true,
    metadata: { creditAmount: "2000", plan: "pro" } },
];
```
I re-checked the one fact that determines whether this fallback is a rare edge case or the only thing that can ever happen: every real product `creditPacks.ts`/`creditPacksConfig.ts` can return has `recurring: null` and no `metadata.type === "subscription"`. That means `subscriptionProducts.filter(...)` against the real backend response is **always empty, on every page load, for every user** — there is no backend state where this filter ever returns anything. `FALLBACK_SUBSCRIPTION` isn't a fallback for an unusual failure; given the current backend, it's the *only* thing that can ever render in that slot.

Combined with `!isProActive` — which I'd already proven in my own original pass is **always true** for every real account, since `plan` can never become `"pro"` through any code path — this means the "Upgrade to Pro — $29/mo, 2000 credits" card is not a dead branch. It renders for every real visitor to the Billing page, every time, with no exception.

### Tracing what happens when it's actually clicked
`handleBuy("price_pro_monthly")` → `createCheckoutSession("price_pro_monthly")` → `POST /billing/checkout` → (now, after the credit-packs feature build) `findCreditPackByPriceId("price_pro_monthly")`. I checked that function's actual behavior on an id that matches nothing in any real pack: it returns `null`. The route correctly responds `404 "Unknown price ID"`, and the user sees a generic `"Failed to start checkout."` toast. The purchase flow is fully reachable, looks completely real (priced, labeled, clickable, loading-state and all), and fails the instant anyone actually tries to use it.

### What I'd originally found, which still stands as a second, separate dead path
The `isProActive`/`subscription` branch I covered in the original version of this finding — the "Manage Subscription" button for an *already-active* Pro account — is still real and still unreachable on its own terms (confirmed: no code path anywhere sets `plan: "pro"`). That part of the UI genuinely is dead code with no live consequence today. But it's a smaller problem than the one above: nobody hits the "manage an existing subscription" screen if nobody can ever start one in the first place. The fallback-array path is the one with an actual, present-day user-facing failure.

### What I'd want before fixing this — and what I'd specifically avoid deciding myself
This needs the same five questions the review raised, and I don't think I should answer them unilaterally:
1. Is there a subscription catalog or checkout path that exists outside what I've read in `creditPacks.ts`/`billing.ts` — something not yet wired in, rather than not yet built at all?
2. Is `FALLBACK_SUBSCRIPTION` meant to be temporary placeholder content, distinct from the credit-pack fallback pattern this audit has otherwise found to be a deliberate, permanent design choice?
3. Is real subscription billing actually on the roadmap, in which case this UI is a head start worth keeping and wiring up properly (real subscription products, a subscription-specific checkout route, webhook-driven entitlement updates, `plan` actually settable)?
4. Or should this be pulled until that's built — replaced with something that doesn't present a purchase flow that can't complete, like a "Coming Soon" state or a waitlist signup?
5. Does this connect to the same product decision Pass 4's Finding #20 already raised about the signup page's Starter plan, or is it a separate question? My instinct is they're the same decision wearing two outfits — both are "should this product have a real subscription tier" — but I want that confirmed rather than assumed, since collapsing them into one decision could be wrong if the intent for Billing's Pro tier and Register's Starter tier were never meant to be the same product.

I haven't touched any of this code. Given the severity revision, I'd treat resolving these five questions as a priority ahead of the litigant-role rendering fix earlier in this pass, since this one has an active, present-day broken checkout button on a real money page, not just a display/styling inaccuracy.

---

## What I verified and found clean this pass

- **`Billing.tsx`'s checkout flow** — `handleBuy`/`handleCustomCheckout` pass `priceId`/`dollars` straight through to the server and navigate directly to whatever `url` comes back; no client-side credit/dollar computation happens anywhere in this file. Confirms the full chain audited end-to-end in Pass 4 (server validates and computes everything) has no gap on the consuming side either.
- **`Billing.tsx`'s auto-refill toggle** — checked specifically because an earlier (different) version of this codebase had a bug where the toggle never synced from the saved preference on page load. In this current file, a `useEffect` correctly reads `userProfile?.autoRefill?.enabled` and syncs the toggle state — this has been fixed since whenever that earlier issue existed. The toggle hardcodes `thresholdCredits: 20, packPriceId: "price_starter"` on every save rather than exposing a configurable threshold/pack picker — confirmed this is a deliberate simplified-UI choice, not a bug, and confirmed `"price_starter"` is still a real, valid price ID in the current `creditPacks.ts` (so it doesn't trigger Pass 4 Finding #12's silent-failure mode).
- **`CREDITS_PER_DOLLAR = 100` hardcoded in `Billing.tsx`** — same duplicated-constant pattern flagged twice already (Pass 2 #5, Pass 3 #8), now a third occurrence. Currently in sync with the backend's real value, no live bug, just the same drift-risk noted for the record rather than re-argued at length.
- **`History.tsx`'s `exportSessionAsMarkdown`** — checked specifically for the same class of issue the much-earlier `exportPDF` HTML-escaping fix addressed. Confirmed this export path is fundamentally lower-risk: output goes into a downloaded `.md` file via `Blob`/`createObjectURL`, never injected into a live DOM as HTML anywhere in the app. No fix needed here.
- **`History.tsx`'s deletion flow** — confirmation dialog gates the action before it fires, consistent with the pattern verified elsewhere in this codebase.
- **`Settings.tsx`'s `handleExportData`** — correctly scoped to the signed-in user's own data via their own token, downloaded locally, never transmitted elsewhere. Noted that the per-session export only includes metadata fields (title, question, status, etc.) and not the actual debate content (transcript, finalAnswer, artifacts) — flagging this as a product question (does "export all my data" need to include full session content?) rather than a bug, since metadata-only is a defensible, deliberate scope.

---

## Where to pick this up next
Finish `Session.tsx` — the SSE/streaming logic, the full config panel interaction surface, the rebuttal-submission flow, and artifact rendering are all still unread. Then `Settings.tsx`'s preferences and notifications sections. After that: `Admin.tsx`'s frontend half, `Landing.tsx`, `ShareReport.tsx` in full, the tools pages, and shared components — same plan as before, just reordered slightly since `Session.tsx` turned out larger than expected.
