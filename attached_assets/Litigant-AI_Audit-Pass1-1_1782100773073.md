# Litigant AI — Audit Handoff, Pass 1 of N
**Scope of this pass:** `artifacts/api-server/src/lib/seatBriefs.ts`, `brainEngine.ts`, `creditEngine.ts`, and the credit reservation/settlement path in `routes/brain.ts`. This is a fresh audit of the zip you just uploaded — nothing carried over from any earlier session. Every finding below is backed by exact file/line references and, where the claim is about magnitude (not just existence), by a calculation you can re-run yourself.

**Status:** In progress. This is one pass through a subset of the codebase — there's a lot more to cover (the rest of `lib/`, every route, the entire frontend). Picking this back up next time should start at `artifacts/api-server/src/lib/creditLedger.ts`, `pricingConfig.ts`, `apiKeyStore.ts`, `conscienceConfig.ts`, `emailService.ts`, `logger.ts`, and the provider files — none of those have been read yet this pass.

**Revision note:** After the first version of this handoff, a closer look at `reserveCredits()`'s exact signature surfaced a fourth finding I'd missed — successful overage charges are ledgered identically to ordinary reservations, not just unsuccessful ones. That's now Finding #4 below. Findings #1-#3 are unchanged in substance; #2 and #3 have more specific fix shapes than the first version had.

### Recommended order if you're fixing rather than just reading
1. **Findings #3 and #4 together** — they're edits to the same few lines (`reserveCredits` and its overage call site), and the leak in #3 is the most direct money-on-the-table item here.
2. **Finding #2** — once #3/#4 are fixed, an accurate pre-run estimate means the overage path gets hit less often in the first place, not just handled better when it is.
3. **Finding #1** — not a billing issue, but a real trust gap; needs your decision on inline-correction vs. a real retry loop before any code changes.

---

## What's new in this codebase since I last looked

Worth knowing up front: the engine has grown a real second stage beyond what a "courtroom" used to mean. It's no longer just litigants debating — there's now a 5-seat pipeline: **Orchestrator → Litigants (debate rounds) → Moderator (synthesis) → Architect (blueprint) → Builder (artifact) → Auditor (quality gate) → Orchestrator (verdict delivery)**. Seat system prompts are now externalized into `artifacts/api-server/src/seats/*.md` files with a Firestore-override layer (`seatBriefs.ts`) instead of being hardcoded strings in `brainEngine.ts`. This is a meaningfully more sophisticated product than a single-stage debate engine, and most of it is well-built — see below for the two real gaps I found in it.

---

## Finding #1 — The Auditor's "return to Builder" loop doesn't exist

**Severity: Medium. Not a crash. A silent quality/trust gap.**

### Where
`artifacts/api-server/src/seats/auditor.md` (the Auditor's system prompt) and `artifacts/api-server/src/lib/brainEngine.ts`, lines 464-516.

### What's broken
The Auditor's brief is explicit about what should happen on rejection:
> "If the artifact has material gaps or errors: return to the Builder with specific revision instructions. **Do not approve a deficient artifact.**"

But I traced every call in `brainEngine.ts` — `grep -n "buildProvider\|Builder\|RETURNED"` returns exactly one Builder invocation (line 480) and no second one anywhere in the file. There is no loop, no conditional branch, no retry. The pipeline runs Builder once, runs Auditor once on that output, and proceeds to deliver a verdict to the user regardless of what the Auditor decided.

The actual mechanism that's supposed to compensate for this is a regex parsing the Auditor's free-text response:
```ts
const approvedArtifactMatch = auditorOutput.match(/(?:APPROVED|RETURNED)[^\n]*\n+([\s\S]+)/i);
const finalArtifact = approvedArtifactMatch ? approvedArtifactMatch[1].trim() : builtArtifact;
```
The Auditor's final instruction line tries to paper over the missing loop by asking it to self-correct inline: *"Output: your release decision (APPROVED or RETURNED) followed by the final artifact text (approved as-is, or corrected version if you found issues)."* That's a reasonable mitigation in principle, but it's in direct tension with the brief's own "do not approve a deficient artifact... return to the Builder" language one paragraph earlier — the prompt is telling the Auditor two different things about what its job is.

### Why this matters in practice
If the Auditor ever follows its brief literally — writing "RETURNED — missing the required X section, Builder please revise" instead of producing a fully corrected document inline — that rejection text gets captured by the regex and delivered to the user as if it were the final artifact. There's no second pass to catch this; whatever text follows the decision word becomes what the user receives, correct or not.

### What I'd want before fixing this
This is a real product decision, not a one-line patch: either (a) rewrite the Auditor's brief to drop the "return to Builder" language entirely and be unambiguous that it must always output a corrected artifact inline (cheapest fix, no architecture change), or (b) actually build the loop — a second Builder call when the Auditor returns "RETURNED", with a round cap to avoid infinite back-and-forth (bigger change, but matches what the brief currently promises). I haven't touched either yet since this is a design call about how much rigor you want here, not a bug with one obvious correct fix.

---

## Finding #2 — Pre-run credit estimate doesn't account for 4 of the engine's 8 AI calls

**Severity: Medium-high. Real, quantified revenue leak — modest per-occurrence, will compound at volume.**

### Where
`artifacts/api-server/src/lib/creditEngine.ts`, `estimateSessionCredits()` (lines 209-234), compared against `artifacts/api-server/src/lib/brainEngine.ts`'s actual call sequence.

### What's broken
`brainEngine.ts` makes exactly 8 real AI calls per session (confirmed via `grep -n "streamRole("`): Orchestrator-open, N litigant turns × rounds, Moderator (max 800 tokens), Architect (max 600), Builder (max 1800), Auditor (max 1200), Orchestrator-close/Verdict (max 1000).

`estimateSessionCredits()` — the function used for the **upfront credit reservation**, i.e. the check that decides whether a user is even allowed to start a session — only models 3 of those: orchestrator-open (400 tokens), the litigant rounds, and a flat `1600` for "verdict." There's no line item for Moderator, Architect, Builder, or Auditor at all. The file's own docstring promises this won't happen: *"Phase 1 — Pre-run: estimateSessionCredits() returns a conservative upper-bound."* It no longer is one.

### How much this actually costs you
I reproduced the exact formula from the file and ran it against a typical default session (3 litigants, 2 rounds, balanced mode, GPT-4o):
- **Reserved upfront:** 54 credits
- **Real cost** (same litigant/round math, plus the 4 missing calls at a conservative 70% of their max-token budget, plus realistic input-context tokens for each): ~83 credits
- **The estimate covers roughly 65% of the real cost.**

I also checked the heavier end (4 litigants, 3 rounds, thorough mode) to see if this scales into something bigger: gap stays roughly flat at ~25-30 credits (~$0.25-0.30) per session, because the four missing calls have fixed token budgets that don't scale with litigant count or rounds. So this isn't a runaway problem on any single session — it's a steady, predictable per-session shortfall that adds up across volume.

### Why it doesn't lose you money on its own — but a second bug does (see Finding #3)
The system does have a real overage-charging mechanism for exactly this situation — `brain.ts` line 391-393, `if (actualCost > estimatedCost) { ...charge the overage... }`. If that worked correctly, the underestimate would just mean slightly tighter early balance checks, not lost revenue. But it doesn't work correctly — see the next finding.

### What I'd want before fixing this
The fix itself is mechanical (add line items to `estimateSessionCredits()` for the four missing seats, using their actual max-token budgets and a reasonable fill-rate assumption), but I didn't make it yet because I want you to confirm the fill-rate assumption — 70% of each seat's max-token budget is a reasonable starting point absent real usage data, but it's still a guess. If you have real session logs showing average completion lengths per seat, that'd make this exact instead of approximate. The later-stage seats (Moderator, Architect, Builder, Auditor) also aren't zero-input calls — each receives the accumulated transcript, blueprint, and/or prior artifact text as context, so the corrected estimate needs an input-token line item for them too, not just output.

One more thing worth deciding explicitly: the function is named `estimateSessionCredits()` and its own docstring calls it "a conservative upper-bound." Once it's corrected to cover the full pipeline, that label becomes true again — but until then, the name and comment overpromise what the function actually does. If for any reason you want to ship a quick partial fix rather than the full correction in one pass, the function should be renamed or re-commented to say plainly that it's an approximation, not a guaranteed upper bound — false confidence in a billing estimate is worse than an honestly-labeled rough one.

---

## Finding #3 — Overage credit charge silently fails when the user can't afford it

**Severity: High. Confirmed revenue leak with zero error trail.**

### Where
`artifacts/api-server/src/routes/brain.ts`, lines 391-393, compared against `reserveCredits()`'s actual contract (lines 134-160 of the same file).

### What's broken
```ts
// If actual > estimated (rare edge case), charge the overage
if (actualCost > estimatedCost && uid) {
  const overage = actualCost - estimatedCost;
  await reserveCredits(uid, overage, result.sessionId).catch(() => {/* non-fatal */});
}
```
`reserveCredits()` is `async (uid, amount, sessionId): Promise<boolean>`. Reading its actual body:
```ts
const balance = (userDoc.data()?.creditBalance as number) ?? 0;
if (balance < amount) return false;
```
**It does not throw when the balance is insufficient — it resolves to `false`.** The `.catch()` on the call site only intercepts genuine exceptions (e.g. a Firestore transaction error). A `false` resolution is a normal, successful promise resolution from `.catch()`'s perspective — it passes straight through, completely unobserved. The returned boolean is never checked or used anywhere on this call.

### Why this means what I think it means
Walk through what happens when a user's balance can't cover the overage: `reserveCredits` correctly declines to touch the balance (good — this is why the account never goes negative, that part of the design is sound), returns `false`, and that `false` vanishes into an unused return value. No log line, no Firestore ledger entry, no error surfaced to the user or to you. **The user keeps the full, completed session — all 8 AI calls, full token output — while only having paid for the original (and per Finding #2, now provably too-low) estimated amount.** This is a clean, repeatable way for any user with a tight balance to underpay for sessions, with no visibility into how often it's happening.

I also want to flag the comment itself — `// rare edge case` — is stale. Given Finding #2 (actual cost now routinely exceeds the estimate by ~30-35% under normal conditions, not as an edge case), this code path is plausibly hit on a meaningful fraction of sessions run by users with low balances, not rarely.

### What I'd want before fixing this
The core fix — check the boolean, stop silently discarding it — has one correct shape, and I'm confident in it:
```ts
const overageReserved = await reserveCredits(uid, overage, result.sessionId).catch(() => false);
if (!overageReserved) {
  // write a record of the shortfall — see Finding #4 for the ledger shape
}
```
What I'm **not** deciding for you is what happens to the *account* after that — the AI work is already done and delivered by the time this fires, so there's no way to undo the session itself. The options range from "just log it for visibility" to "block the user's next session until the shortfall is paid." That second option is a real product/support-burden decision (a user could get locked out over a small or disputed amount), so I'm leaving it as an open question rather than folding a default policy into what I'd call a pure bug fix. The minimum, no-judgment-call version is: check the boolean, write a record, make it visible to you. Anything beyond that is a policy choice I'd want your sign-off on first.

---

## Finding #4 — Successful overage charges are indistinguishable from ordinary reservations in the ledger

**Severity: Medium. A real auditability gap, separate from Finding #3's silent-failure problem.**

### Where
`artifacts/api-server/src/routes/brain.ts`, `reserveCredits()`, lines 134-161 — specifically the hardcoded ledger write.

### What's broken
I went back and checked this precisely after it was raised: `reserveCredits` takes exactly three parameters — `uid`, `amount`, `sessionId` — there is no fourth `source` argument. Its ledger write hardcodes the literal string:
```ts
const txRef = db.collection("credit_transactions").doc();
txn.set(txRef, {
  userId: uid,
  type: "usage",
  amount: -amount,
  balanceAfter: newBalance,
  source: "brain_reservation",   // ← always this, no matter which call site invoked it
  sessionId,
  createdAt: FieldValue.serverTimestamp(),
});
```
Both call sites use this same function: the original pre-run reservation (`reserveCredits(uid, estimatedCost, sessionId)`, line 279) and the post-run overage charge (`reserveCredits(uid, overage, result.sessionId)`, line 393). Both produce a ledger entry that says `source: "brain_reservation"`. There is currently no way to tell, by reading the `credit_transactions` collection alone, whether a given charge was the original estimate or a later overage correction for the same session.

### Why this matters
This isn't a money problem on its own — the user is correctly charged either way (when the overage call succeeds at all; see Finding #3 for when it doesn't). It's an auditability problem: a session that ran over its estimate should show a clear three-part trail — `brain_reservation`, then `brain_overage`, possibly followed by a `brain_reconcile` refund if the numbers later moved the other way. Right now it just shows two `brain_reservation` entries for the same session, and you'd have to cross-reference amounts and timestamps to reconstruct what actually happened. Combined with Finding #2 (overages becoming the normal case, not the rare one), this will get harder to make sense of over time, not easier.

### What I'd want before fixing this
This one's a clean, low-risk fix: add an optional fourth parameter to `reserveCredits` — `source: string = "brain_reservation"` — and pass `"brain_overage"` explicitly from the overage call site. I haven't made this change yet since it's bundled with Finding #3 in practice (you'd want to fix the boolean-check and the mislabeling in the same pass, since they're both edits to the same few lines), and I wanted to confirm the shape with you before touching shared billing code. If you want, the `overage_uncollected` record from Finding #3 and this `source` parameter can both land in one combined edit — they're not in tension with each other.

---

## What I verified and found clean this pass (so you know what's already been checked)

- **`seatBriefs.ts`** — file-based defaults loaded once at module init, Firestore overrides with a 5-minute TTL cache, graceful degradation if Firestore is unreachable, explicit cache-invalidation hook for the admin UI. No issues.
- **`brainEngine.ts`'s per-seat provider resolution** (`resolveSeatProvider`) — correctly falls back to the global provider if a seat-specific override isn't configured or fails to instantiate; wrapped in try/catch so a bad seat assignment can't crash a whole session.
- **`brainEngine.ts`'s independent-vs-shared reasoning mode** — when `aiReasoning === "independent"`, each litigant only sees its own prior turns (not the full transcript), which correctly keeps input tokens flat across rounds instead of compounding — matches the inline comment's stated intent, verified against the actual conditional logic.
- **The credit cap / early-stop mechanism** (`creditCapHit`) — correctly breaks out of both the inner role loop and the outer round loop, and `pauseReason` is set correctly to distinguish a credit-cap stop from a confidence-target-never-reached stop.
- **`calculateLiveCredits` is genuinely wired in** — confirmed `brain.ts` line 379 actually calls the Firestore-aware live-multiplier settlement function (not a stale hardcoded fallback), so admin-configured pricing overrides do take effect in real settlement.
- **`reconcileCredits()` (the refund path, distinct from the overage-charge path in Finding #3)** — correctly uses `.catch((e) => console.error(...))`, logging failures instead of swallowing them silently. This is the correct pattern; Finding #3 is about the *other* function call not following it.

---

## Two small things noticed in passing, not yet investigated

- `creditEngine.ts`'s `MODEL_RATES` table is dated "as of June 2026" in its own comment — worth a periodic check against current provider pricing pages, but I haven't verified any individual rate against a live source this pass.
- `getModelMultiplier()` explicitly returns the **hardcoded** default, with a docstring warning not to use it for real settlement (use the Firestore-aware version in `pricingConfig.ts` instead) — I haven't yet verified every call site respects that distinction; `pricingConfig.ts` itself is next on the list for this exact reason.

---

## Where to pick this up next
Not yet read this pass: `creditLedger.ts` (the actual `addCredits`/atomic-ledger implementation these route functions presumably wrap or duplicate — worth checking for overlap/inconsistency with the `reserveCredits`/`reconcileCredits` defined locally in `brain.ts`), `pricingConfig.ts`, `apiKeyStore.ts`, `conscienceConfig.ts`, `emailService.ts`, `logger.ts`, all four provider files, every route file, and the entire frontend. Same ground rules apply going forward: nothing gets flagged without a quote and a line number, nothing gets fixed without showing you the broken behavior first.
