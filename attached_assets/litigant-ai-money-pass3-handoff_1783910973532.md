# Litigant AI — Money/Credits Audit — Pass 3 Handoff
**Scope:** Production paths only. Continues from Pass 1 and Pass 2. Findings numbered 7+.
**Method:** Same standard throughout — every claim verified against actual source, exact file/line citations, nothing inferred.

**Major development this pass:** discovered `artifacts/api-server/src/lib/checklistConfig.ts` — a Firestore-backed setup checklist referencing a full prior audit history ("Passes 1-10"), with items marked resolved or open. This is a second source of truth I hadn't cross-referenced yet. Checking my own findings and this pass's new findings against it surfaced real discrepancies **in both directions** — some items marked "done" that verifiably aren't, and some items still listed as open TODOs that the current code already fixes. Both are worth knowing about, since this checklist is presumably a tool you rely on for status.

---

## Finding 7 — Checklist Claims Litigant Cap Was Fixed; Code Says Otherwise

**Priority: High.** This directly corroborates Pass 2's Finding 4, but the discrepancy itself is the more important part.

**The claim** (`checklistConfig.ts`):
- Line 49: `agent-litigant-cap` — *"✅ DONE: Fixed litigant cap — creditEngine.ts raised from 4 to 10 to match brainEngine"* (Audit Pass 4 #11 — resolved)
- Line 67: `owner-litigant-cap-decision` — *"✅ DONE: Litigant cap set to 10 — creditEngine.ts and brainEngine.ts updated"* — *"Picker max and cost formula both respect 10."*

**What's actually true, directly verified:** `creditEngine.ts`'s formula was indeed raised to cap at 10 (`Math.min(config.litigantCount, 10)`, confirmed in Pass 1/2 review). But `brainEngine.ts`'s `getRoles()` (lines 48-56) still only defines **4 hardcoded personas** and still caps actual execution at `Math.min(config.litigantCount, roles.length)` where `roles.length === 4`. This is the exact bug in Pass 2's Finding 4 — I verified it independently before finding this checklist entry.

**What this means:** whoever closed this checklist item fixed the credit-*estimate* formula's ceiling to match a persona count that was believed to be 10, but never actually built the additional 6 personas in `brainEngine.ts`, and the item got marked resolved anyway. The two files were never actually brought into agreement — only the number in one of them was changed to match an assumption about the other that wasn't true. This is worth knowing not just because the bug exists (already flagged), but because it shows this specific checklist entry's "done" status can't be trusted without independent verification — worth keeping in mind for any other entries you or Rep haven't re-checked recently.

---

## Finding 8 — Checklist Lists Two Money Bugs As Open That Are Already Fixed

**Priority: Low (informational) — good news, but the checklist should reflect it.**

**The claims** (`checklistConfig.ts`):
- Line 42: `agent-overage-silent-fail` — *"Fix overage credit charge silently failing when the user can't afford it"* (Audit Pass 1 #3, no "done" marker)
- Line 43: `agent-overage-ledger` — *"Fix successful overage charges being ledgered identically to failed ones"* (Audit Pass 1 #4, no "done" marker)

**What's actually true, directly verified in `brain.ts` lines 419-446:** Both are already fixed. When an overage charge (`reserveCredits` for the amount actual cost exceeds the estimate) fails due to insufficient balance, the code:
- Catches the failure explicitly (line 424-425: `.catch(() => false)`)
- Logs a warning with uid/sessionId/overage amount (lines 430-432)
- Writes a distinct ledger entry with `type: "usage_shortfall"`, `amount: 0`, `source: "brain_overage_uncollected"` (lines 434-443) — clearly distinguishable from a successful overage charge, which would carry `type: "usage"` and `source: "brain_overage"` via the normal `reserveCredits()` path.

Both the "silently fails" and "ledgered identically" complaints are resolved by this same code block. Recommend updating these two checklist entries to "✅ DONE" so they don't get re-worked or cause confusion later.

---

## Finding 9 — Checklist Says the Auditor→Builder Retry Loop "Doesn't Exist"; It Does

**Priority: Low (informational).**

**The claim** (`checklistConfig.ts` line 44): `agent-auditor-loop` — *"Build a real Auditor → Builder retry loop (currently doesn't exist)"* (Audit Pass 1 #1, blocked note: *"blocked on owner decision: inline correction vs. full retry loop"*)

**What's actually true, directly verified in `brainEngine.ts` lines 470-565:** A working Auditor→Builder retry loop exists — `MAX_AUDITOR_RETRIES = 2` (line 475), a loop from `attempt = 1` to `1 + MAX_AUDITOR_RETRIES` (line 506), each iteration running the Auditor, checking for an `APPROVED`/`RETURNED` decision, and on `RETURNED` running a Builder revision pass with the Auditor's specific notes extracted via regex (lines 546-565) before looping back for re-review. This is exactly the "full retry loop" option the checklist note said was still an open decision — it's been built.

**Recommendation:** update this checklist entry to reflect that the retry-loop decision was made and implemented, so it stops showing as blocked/open.

---

## Finding 10 — Checklist Describes Stale "Maximum Credits" Dropdown Values

**Priority: Informational, needs your input to fully resolve.**

**The claim** (`checklistConfig.ts` line 61): `agent-recalibrate-max-credits` — *"Recalibrate the 'Maximum Credits' dropdown against real ~83-credit session cost"* — *"Current options (10/15/25/50/100) predate the corrected cost figure."*

**What's actually true, directly verified in `Session.tsx` lines 534-538:** The dropdown's current options are **100 / 250 / 500 / 1,000 / 2,500** — not 10/15/25/50/100 as the checklist note describes. The values have already changed since this note was written.

**What I can't verify from the zip alone:** whether 100-2,500 represents a genuine recalibration against real session costs, or just a different arbitrary set of numbers. Given Finding 6 (Pass 2) — that the "hard cap" doesn't actually cap the fixed pipeline — and Finding 7 above (the credit-formula unification item is still explicitly open, per `agent-credit-formula`, blocked on your fill-rate input) — I'd treat this as still genuinely unresolved rather than assume the new numbers are correct. Worth deciding together with Finding 6's fix, since they touch the same numbers.

---

## Confirmed Clean This Pass

- **Rebuttal chain cost accounting** (queued from Pass 2): each rebuttal run gets its own fresh `reserveCredits()` call and its own full `maxCredits` allowance — verified in `brain.ts`, no special-casing for `rebuttalContext` around config/credits. Not a bug, but worth knowing: a user can "Reconvene the Court" repeatedly and each pass gets an independent cap, not a shared running total.
- **`Billing.tsx`** — auto-refill checkout listener only allows the client to *delete* the checkout URL field (matches the Firestore rule verified in Pass 1), never set it; manual checkout amount validation mirrors the server's $1-$500 bounds.
- **`apiKeyStore.ts`** — raw provider API keys never leave the server; `GET /admin/api-keys` only returns masked keys. One very minor inconsistency noted (not a real finding): `PUT /admin/api-keys/:providerId` sanitizes the provider ID before saving, `DELETE` doesn't before deleting — low practical risk since the frontend always passes back the already-sanitized ID from `GET`.

---

## Not Yet Audited (queued for next pass)
- `agent-audit-admin-tsx` (per the checklist itself) — `Admin.tsx` frontend (~2,660 lines) is explicitly flagged as never reviewed.
- `Landing.tsx`, tool pages, shared components (`AppLayout`, `CourtDiagram`, `LandingDemoPlayer`, `OnboardingWizard` beyond what Pass 2 already touched) — flagged in the checklist as never audited.
- The rest of the checklist's "owner" section (deployment/secrets items) — not code, so out of scope for this money/security audit, but worth a read if you want a deployment-readiness pass specifically.
- Whether any *other* checklist items besides the litigant cap have a similar false-"done" problem — I only spot-checked the money-related ones this pass; a full reconciliation of all ~20 agent-section items against current code would be a good dedicated Pass 4 if useful.
