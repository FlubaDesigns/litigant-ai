# Litigant AI — Audit Handoff, Pass 9 of N
**Scope of this pass:** Finishing `Session.tsx` — the ~950 lines of `SessionPage`'s main component body, `ConfigPanel`'s top section, and the rebuttal-submission UI, all left unread at the end of Pass 8. This closes out the highest-stakes parts of the file; see the note at the end on what's still genuinely unread.

**Status:** `Session.tsx` is now substantially covered (`isLitigantRole`/`DialogLine`/`exportPDF` in Pass 8; the credit-estimate logic, `handleRun`, the rebuttal button, and the provider-loading effects in this pass). Still unread in this file: `ConfigPanel`'s remaining field-by-field UI (mostly markup, lower risk), the activity log rendering, and the full `SeatInspector` component it opens (a separate file, not yet read at all). Not yet read anywhere in this arc: `Settings.tsx`'s preferences/notifications sections, `Admin.tsx`'s frontend half (beyond the credit-packs tab I built), `Landing.tsx`, `ShareReport.tsx` in full, the tools pages, and shared components.

**Revision:** Finding #27 is sharpened, not changed in substance, after review. I'd already noted that `handleRun`'s gate uses the unpadded base estimate rather than the displayed high end — what was added is the explicit point that this makes the UI's padded range purely informational (nothing downstream of the display ever checks against it), confirmation that the rebuttal button shares the exact same gate variable (not a parallel, separately-broken check), and a concrete interim fix: gate on `credHigh` instead of the base estimate as a one-line stopgap, ahead of the larger shared-formula fix this finding already called for.

---

## Finding #27 — The client-side credit estimate shown before a session starts is the same stale formula as Pass 1's Finding #2, hand-copied into the frontend — and it's what gates whether a user is even allowed to click "Run"

**Severity: Medium-High. This is the user-facing entry point into a revenue-leak chain Pass 1 already documented on the backend — this pass traces it forward to the actual button a user clicks.**

### Where
`artifacts/gh-brain/src/services/providerService.ts`'s `estimateCredits()`, used throughout `Session.tsx` (`ConfigPanel`'s displayed cost range, `handleRun`'s pre-flight balance check, and the rebuttal button's disabled state).

### What's broken
```ts
export function estimateCredits(
  creditInfo: ModelCreditInfo,
  litigantCount: number,
  maxIterations: number,
  responseMode: ResponseMode
): number {
  const tokensPerTurn = { concise: 300, balanced: 600, thorough: 1200 }[responseMode];
  const litigants = Math.min(litigantCount, 4);
  const rounds = maxIterations;
  const outputTokens = 400 + litigants * rounds * tokensPerTurn + 1600;
  const historyPerRound = tokensPerTurn * litigants * 0.8;
  const avgInputPerTurn = 600 + historyPerRound * (rounds / 2);
  const inputTokens = litigants * rounds * avgInputPerTurn + 8000;
  ...
}
```
I compared this line by line against `creditEngine.ts`'s `estimateSessionCredits()` (the backend function Pass 1's Finding #2 already established is stale, missing the Moderator/Architect/Builder/Auditor pipeline stages added after this formula was first written) — they're identical, down to the same magic numbers (`400`, `1600`, `0.8`, `8000`). This isn't two formulas that happen to agree; it's the same formula maintained by hand in two unconnected files, the fourth instance of this exact pattern in this codebase (after Pass 2's #5, Pass 3's #8, and the duplicated bounds-type I caught in my own credit-packs feature work).

### Quantified, using Pass 1's own numbers
I ran the frontend formula for the same default session Pass 1 already used (3 litigants, 2 rounds, balanced, GPT-4o):
```
UI shows range: 54 - 76 credits   (the +40% padding ConfigPanel adds on top of the base estimate)
Pass 1 already established real cost: ~83 credits, for this exact configuration
```
Even the padded high end of what a user sees before clicking "Run" is below the real settled cost. The padding looks like a deliberate attempt to build in safety margin for estimation error — it just isn't enough margin, because the gap isn't noise, it's five entire missing pipeline stages.

### Tracing this forward to where it actually matters
`Session.tsx`'s `handleRun()`:
```ts
if (userProfile && userProfile.creditBalance < estimatedCredits) {
  toast.error(`You need at least ${estimatedCredits} credits to run this session.`, { ... });
  return;
}
```
`estimatedCredits` here is the **unpadded** base number (54, not the displayed 54-76 range) — the same stale formula, computed without even the frontend's own safety margin. A user with, say, 60 credits passes this client-side gate (60 ≥ 54). The server's own pre-flight check (Pass 1's `brain.ts`, which reserves credits using the *same* stale backend formula) would also let them through, for the same reason. The session runs, costs the real ~83 credits, and Pass 1's already-documented overage-collection mechanism attempts to charge the ~29-credit difference — which Pass 1's Finding #3 already proved can silently fail to collect if the user's depleted balance can't cover it, with no error surfaced anywhere. This pass doesn't change that finding; it traces the path a real user actually takes to trigger it, starting from the literal button they click.

The rebuttal-submission button (`disabled={!rebuttalChallenge.trim() || insufficientCredits}`) reuses the identical `insufficientCredits` flag, meaning a rebuttal — which re-runs the entire multi-stage pipeline again — is gated by the same single-session, already-too-low estimate, not a rebuttal-specific recalculation. This isn't a separate problem from the Run button's gate — it's the exact same `insufficientCredits` variable, computed once, so whatever's wrong with one gate is wrong with both, identically.

**Clarification worth stating on its own, not just as a step in the chain above:** `ConfigPanel` shows a padded range (`credLow`–`credHigh`, the base estimate plus up to 40%) specifically because the formula's own error margin is known to be real. But neither `handleRun`'s gate nor the rebuttal button's gate reads `credHigh` — both read the unpadded `estimatedCredits` only. That means the padding shown to the user is informational only; it does not protect the credit system in any way, because nothing downstream of the display actually checks against it. A user could be let through both gates with a balance that's enough for the low end of what they were shown, but not the high end of what they were shown — let alone the real cost, which (per the quantification above) exceeds even that high end.

### What I'd want before fixing this
This should be fixed at the same time as Pass 1's Finding #2, not separately — once you confirm the fill-rate assumption Pass 1 asked for (how much of each non-litigant stage's max-token budget gets used on average), the corrected formula should live in exactly one place, and the backend reservation, the frontend displayed estimate, the frontend Run-button gate, and the rebuttal-button gate should all compute from that single source rather than each maintaining their own copy that can drift further apart the next time the pipeline changes. I haven't touched either file for this reason — fixing the frontend alone without the backend fix would just create a third, different number to reconcile.

In the meantime, before that shared model exists, there's a smaller, immediately-applicable interim fix worth doing on its own: change both gates (`handleRun`'s balance check and the rebuttal button's `disabled` prop) to check against `credHigh` — the padded estimate already computed and already shown to the user — instead of the unpadded `estimatedCredits`. That doesn't fix the underlying formula being stale, but it does make the UI's own displayed safety buffer actually function as one, rather than being informational text that nothing downstream of the display checks against. This is a one-line change in each of the two gates, doesn't require resolving the bigger fill-rate question first, and strictly improves the current situation without making the eventual shared-formula fix any harder to do later.

---

## What I verified and found clean / consistent with prior passes

- **`ConfigPanel`'s `getProviders()` call** and **`SessionPage`'s own "Load provider credit info" effect** — both call the same sync, env-var-only provider-discovery endpoint Pass 6's Finding #17 already flagged as blind to Firestore-only-configured providers. Two more confirmed consumers of the same gap, not new findings — reinforces that fixing Finding #17 has more surface area than just the original `/providers` route consumer I'd checked.
- **The rebuttal button's disabled condition and active-state styling** — matches `replit.md`'s documented description of this feature exactly (the fourth specific claim from that doc to check out precisely against the real code across this audit, after the seat-brief cache invalidation, the ban-endpoint failure behavior, and the `api_logs` fallback in earlier passes).
- **`sessionsLeft`** (`Math.floor(credits / estimatedCredits)`) — computed in `SessionPage` but never rendered anywhere; confirmed via exhaustive grep that it has no second reference in the file. Dead code, not a user-facing bug — noted in passing, not written up as a finding.
- **`ConfigPanel`'s auto-save-on-close behavior** — saves the full mission-briefing config to the user's profile via `saveUserConfig` only if the user actually changed something (`hasChanges` ref) and only if `onboardingComplete` is true, avoiding an unnecessary write on every panel close. Sound, deliberate guard.

---

## Where to pick this up next
`ConfigPanel`'s remaining field UI and the activity log rendering in `Session.tsx` (lower-risk, mostly markup), then `SeatInspector.tsx` (a separate component file, not yet read at all, directly relevant to Pass 4's litigant-count finding since this is where a user actually assigns providers to individual seats). After that: `Settings.tsx`'s preferences/notifications sections, then `Admin.tsx`'s remaining frontend (everything beyond the credit-packs tab), `Landing.tsx`, `ShareReport.tsx` in full, the tools pages, and shared components.
