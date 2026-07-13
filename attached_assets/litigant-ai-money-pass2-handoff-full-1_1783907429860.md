# Litigant AI — Money/Credits Audit — Pass 2 Handoff (Full)
**Scope:** Production paths only. Continues directly from Pass 1 (`litigant-ai-money-pass1-handoff.md`) — findings numbered 6+ to keep one continuous list across both documents.
**Method:** Every claim verified against actual source with exact file/line citations. Nothing inferred. Where something is a recommendation/design proposal rather than a verified fact, it's labeled as such.

---

## Finding 6 — "Hard Spending Cap" Does Not Cap Spending

**Priority: High.** Direct, user-facing broken promise about money.

**The promise (`Session.tsx` line 529, tooltip shown to every user configuring a session):**
> *"A hard spending cap for this session. If a run is on track to exceed this many credits, it stops early rather than continuing to spend. This protects you from an unexpectedly expensive session."*

**What actually happens — `brainEngine.ts`:**

1. The cap is only checked inside the debate loop, once per litigant turn:
   - Line 320: `const creditCap = config.maxCredits ?? Infinity;`
   - Line 390: `if (creditsUsedSoFar >= creditCap) { creditCapHit = true; break; }`
2. When the cap is hit, the debate loop breaks (line 397: `if (creditCapHit) break;`) — but execution does **not** stop. It falls through unconditionally into:
   - **Moderator** (line 416 onward) — 1 AI call
   - **Architect** (line 441 onward) — 1 AI call
   - **Builder** (line 477 onward) — 1 AI call
   - **Auditor retry loop** (lines 470-565) — `MAX_AUDITOR_RETRIES = 2` (line 475), meaning **up to 3 Auditor calls and up to 2 additional Builder revision calls**, none of which check `creditCapHit` or the cap
   - **Verdict** (line ~579 onward) — 1 more AI call

None of these six-to-nine additional AI calls check `config.maxCredits` or `creditCapHit` at any point. The session's final settled cost (`calculateLiveCredits()` in `pricingConfig.ts`, from real token counts) can and does exceed the cap the user set.

**Scale of overshoot:** `FIXED_STAGE_PRIOR` in `creditEngine.ts` (line 242) estimates the fixed stages alone at ~12,500 input + ~4,590 output tokens *before* any Auditor retries — roughly **50+ credits minimum** at default `gpt-5` pricing, more with retries or a pricier model. The lowest selectable cap in the UI is **100 credits** (`Session.tsx` line 534), so a user protecting a small balance could see a 50-100%+ overshoot past what they were told was a hard ceiling.

**This is architecturally intentional, not an oversight — important distinction.** `brainEngine.ts` lines 401-404, right after the debate loop:
> *"Snapshot cumulative usage at end of debate. The delta from here to the end of the session captures the five fixed pipeline stages (Moderator, Architect, Builder, Auditor, Verdict). Saved to Firestore so `getCalibratedFixedStageTokens()` can learn real averages from the last 50 sessions instead of using hardcoded priors."*

This comment says nothing about the credit cap directly, but it confirms the five fixed stages are architected as an **always-run block** whose token usage feeds the calibration system (`getCalibratedFixedStageTokens()` in `creditEngine.ts`). Skipping them when the cap hits isn't a one-line patch — it either puts holes in calibration data or requires deciding how capped sessions should report. The implementation is internally consistent with itself; the inconsistency is between that consistent architecture and the "hard spending cap" promise in `Session.tsx`.

---

## The Pause/Resume UI Already Exists — But It's Currently Theatre

Dave's ask: when the cap is hit, prompt the user to either raise it or accept the current answer as final, **before** any more money is spent.

**What's already built** (`Session.tsx` lines 1636-1650): a pause card that shows *"⏸ Credit cap reached — X% confidence"* with two buttons: **"Continue — {credits} cr"** and **"Accept answer."** This looks exactly like what's being asked for. It isn't, yet — three concrete gaps, all verified:

**1. It fires after the money's already spent.**
`useBrainSession.ts` lines 456-471: the `phase: "paused"` state is only set when the `"done"` SSE event arrives — and per `brainEngine.ts`, `"done"` is the *final* event, sent only after the entire Moderator→Architect→Builder→Auditor→Verdict pipeline (Finding 6) has already run and been charged. The prompt appears after the overshoot has already happened, not before it. It currently functions as an after-the-fact notice, not a spending gate.

**2. "Continue" starts an entirely new session rather than extending the paused one.**
`useBrainSession.ts` lines 532-560 (`continueSessionFn`): clicking Continue fires a brand-new `POST /run-brain` request with `continueFromTranscript: s.pauseTranscript`. On the backend, `brain.ts` treats this as a fresh session: new `reserveCredits()` call, new full run of the entire fixed pipeline. So today, clicking Continue means paying for a *second* full Moderator/Architect/Builder/Auditor/Verdict cycle stacked on top of the first — compounding Finding 6 rather than resolving it.

**3. There's no way to actually raise the cap.**
`useBrainSession.ts` line 545: the continue request sends `config: s.config` — unchanged, same `maxCredits` as the original run. The pause card (`Session.tsx` 1636-1650) has no input for a new cap value. So even if the pipeline genuinely stopped in time, clicking "Continue" today would walk straight back into the identical wall it just hit.

---

## Feature Spec: What Building the Real Version Requires

This is a real feature build, not a small patch, because Finding 6's fix is a prerequisite for it. Laid out as current state → target state so Rep has a clear spec.

### Target behavior
1. Debate loop hits the cap (as it already correctly detects, `brainEngine.ts` line 390).
2. Backend **stops calling AI providers immediately** — no Moderator/Architect/Builder/Auditor/Verdict yet.
3. Backend emits a genuine pause signal to the client at that point (a new SSE event type, e.g. `type: "paused_pre_pipeline"`), carrying the debate transcript so far and the current confidence.
4. Frontend shows the decision prompt **at that moment** — before any further spend — with two real choices:
   - **Raise the cap and continue:** user enters/selects a new `maxCredits` value; backend resumes the *same* session (not a new reservation) with the new cap and proceeds into the fixed pipeline.
   - **Accept as final:** backend runs a lightweight finalization using only the debate so far — worth deciding whether that still means the full Moderator→Verdict pipeline (spending more, just with the user's explicit consent) or a cheaper summary-only close.

### What needs to change, concretely
- **`brainEngine.ts`:** move the `creditCapHit` check to gate entry into the fixed pipeline, not just exit the debate loop. Needs a real mid-stream pause point — likely restructuring the function so the fixed pipeline is a separately callable continuation rather than code that always runs inline after the debate loop.
- **`brain.ts`:** the reservation/reconciliation model currently assumes one `reserveCredits()` → one run → one `reconcileCredits()`. A genuine pause needs either: (a) a way to hold the session open server-side awaiting a client decision, or (b) reconcile what was spent on the debate portion immediately at pause time, then treat "continue" as a fresh, smaller reservation for just the fixed pipeline — this is probably the more robust option given the stateless-request architecture already in place.
- **`useBrainSession.ts` / `Session.tsx`:** the pause card needs an actual input control for the new cap value, and `continueSessionFn` needs a resume path that doesn't re-run the debate loop from scratch — it should pick up from `pauseTranscript` and go straight into the fixed pipeline with the new cap.
- **Calibration system:** decide what `getCalibratedFixedStageTokens()` should do with sessions that paused and were later resumed vs. sessions accepted as partial with no fixed-stage data at all — this was flagged as an open question in Finding 6 and applies here too.

### Decision confirmed by Dave: Full pause-and-decide build

Direction is set — build the real version, not the minimal fix. When the debate loop hits the cap, the backend stops calling AI providers, and the user is prompted to either raise the cap and continue, or accept the current state as the final answer. This is a real feature build with the following as prerequisites and components, all from the spec above:

1. **`brainEngine.ts`:** restructure so the fixed pipeline (Moderator/Architect/Builder/Auditor/Verdict) is a separately callable continuation, not code that always runs inline after the debate loop. The `creditCapHit` check needs to gate entry into that continuation, not just exit from the debate loop.
2. **`brain.ts`:** decide the reservation model for a genuine mid-session pause. Given the stateless-request architecture already in place, the more robust option is likely: reconcile what was spent on the debate portion immediately at pause time, then treat "continue" as a fresh, smaller reservation for just the fixed pipeline (rather than trying to hold a session open server-side across requests).
3. **New SSE event:** backend emits a real pause signal at the cap-hit moment (e.g. `type: "paused_pre_pipeline"`) carrying the debate transcript so far and current confidence — this replaces the current behavior where `"done"` (the final, post-pipeline event) is the only thing that ever triggers the pause UI.
4. **`useBrainSession.ts` / `Session.tsx`:** the pause card needs an actual input control for a new cap value (currently missing entirely — see gap 3 above), and the resume path needs to pick up from `pauseTranscript` and go straight into the fixed pipeline with the new cap, rather than restarting the debate loop from scratch (current `continueSessionFn` behavior, gap 2 above).
5. **Calibration system:** decide what `getCalibratedFixedStageTokens()` should record for sessions that paused and were later resumed vs. sessions accepted as partial with no fixed-stage data at all — this was flagged as open in Finding 6's own architectural note and applies here too. Simplest default: only sessions that complete the full fixed pipeline (whether on the first pass or after a resume) report calibration data; partial/accepted-as-final sessions don't.

This touches `brainEngine.ts`, `brain.ts`, `useBrainSession.ts`, and `Session.tsx` — real cross-file architecture work, not a quick patch. Ready to hand to Rep as a scoped project with this document as the spec.

---

## Confirmed Solid This Pass (no action needed)

- **`pricingConfig.ts`** — live admin-overridable multipliers, properly cached with immediate invalidation on write. `PUT /admin/pricing/:model` validates 1–100 range before calling `saveMultiplierOverride()`.
- **`creditPacksConfig.ts`** — sensible immutability rule (pack IDs never change, since Square's webhook note references them). `CREDIT_PACK_BOUNDS` properly enforced on create and update.
- **Provider/model resolution** (`resolveProvider`, `resolveSeatProvider`) in `brainEngine.ts` — graceful fallback, no way for a client to force an invalid provider.

---

## Not Yet Audited (queued for next pass)
- Frontend `Billing.tsx` — auto-refill checkout URLs and payment history rendering.
- `apiKeyStore.ts` — provider API key storage/masking in Firestore.
- `checklistConfig.ts` / pre-launch checklist system.
- Rebuttal chain cost accounting — does a rebuttal run get its own fresh `maxCredits`, or inherit the original session's already-spent one?
