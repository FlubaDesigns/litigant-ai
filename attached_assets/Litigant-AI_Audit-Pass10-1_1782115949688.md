# Litigant AI — Audit Handoff, Pass 10 of N
**Scope of this pass:** `Session.tsx`'s `ConfigPanel` remaining fields (closing out the file), `SeatInspector.tsx` in full, and `Settings.tsx`'s `PreferencesTab`. `NotificationsTab` was referenced while reading `Settings.tsx`'s tab-routing code but not read line-by-line — it stays on the not-yet-audited list below, not in this pass's completed scope.

**Status:** `Session.tsx` is now fully read. `SeatInspector.tsx` is fully read. `Settings.tsx`'s `PreferencesTab` is read; `NotificationsTab` remains unread (not reviewed this pass at all — see note at the end). Not yet read anywhere in this arc: `Admin.tsx`'s frontend (beyond the credit-packs tab built earlier), `Landing.tsx`, `ShareReport.tsx` in full, the tools pages, and the remaining shared components (`AppLayout.tsx`, `CourtDiagram.tsx`, `LandingDemoPlayer.tsx`, `OnboardingWizard.tsx`).

**Revision:** Finding #28 is revised after review. The core claim (selecting a Debate Mode option forces `courtMode`, swapping the entire courtroom rather than toggling a behavior within it) is fully verified and stands. I retracted a secondary claim I'd stated as fact without verifying it — that clicking an already-selected option re-fires the change handler — since I can't confirm that against this Radix-based `Select` component's actual behavior from this sandbox, and shouldn't have asserted it. The finding's architectural framing is also sharpened: `courtMode` should determine who speaks, `debateMode` should determine how they speak, as two independent settings — right now only the first concept has any real implementation. The `NotificationsTab` scope/status line above is also corrected; it should never have been listed as part of this pass's coverage.

---

## Finding #28 — "Debate Mode" doesn't toggle a behavior, it silently picks the courtroom — `debateMode` has no independent meaning anywhere in the engine

**Severity: Medium-High. The core claim is fully verified directly from the code. A secondary mechanism I'd originally included (clicking an already-selected option) was an unverified assumption on my part — removed below, see the correction.**

### Where
`artifacts/gh-brain/src/pages/app/Session.tsx`, `ConfigPanel`'s "Debate Mode" field:
```tsx
<Select value={config.debateMode} onValueChange={(v) => handleChange({
  debateMode: v as CourtConfig["debateMode"],
  courtMode: v === "adversarial" ? "adversarial" : "analysis"
})}>
  <SelectItem value="adversarial">Adversarial</SelectItem>
  <SelectItem value="collaborative">Collaborative</SelectItem>
</Select>
```
with the description text directly above it: *"Adversarial: AIs challenge each other. Collaborative: AIs build on each other."*

### What's actually happening — the verified core claim
The label and description present this as a behavioral toggle — how the same participants interact. What the handler actually does is set `courtMode`, the field that determines which four personas execute at all (`getRoles()` in `brainEngine.ts`, confirmed back in Pass 1). I confirmed `debateMode` is never read anywhere in `brainEngine.ts`'s actual execution logic — grepped for it specifically, zero matches outside the type declaration. So:
- Selecting "Adversarial" forces `courtMode: "adversarial"`.
- Selecting "Collaborative" forces `courtMode: "analysis"`.

These are two different courtrooms with two different, unrelated sets of four personas (`Advocate`/`Skeptic`/`Devil's Advocate`/`Empiricist` vs. `Analyst`/`Contrarian`/`Realist`/`Futurist`), not the same four personas behaving two different ways. A user selecting "Collaborative" expecting their current litigants to cooperate instead of clash gets a courtroom swap instead — the user is shown a behavioral control; the engine receives a courtroom selection. Those are not the same thing, and there is no way through this control, or anywhere else in `Session.tsx`, to reach `"socratic"` or `"critique"` mode live.

### A real reproduction path, verified end to end
- `templates.ts` has four templates that set `courtMode: "critique"` and two that set `courtMode: "analysis"` — none of them also set `debateMode`.
- `debateMode` is only ever initialized once, in `DEFAULT_CONFIG`, hardcoded to `"adversarial"` — confirmed by grep, no template overrides it.
- So a user who selects a Critique template ends up with `state.config.courtMode === "critique"` while `state.config.debateMode` is still `"adversarial"` — the template changed one without the other. Opening the Mission Briefing panel shows "Debate Mode: Adversarial" highlighted, with nothing on screen indicating the actual court mode is Critique, not Adversarial.

### Correction to my own original version of this finding
I'd originally extended the reproduction path one step further, asserting that clicking the already-highlighted "Adversarial" option would still fire `onValueChange` and forcibly reset `courtMode` back to `"adversarial"` — stated as a fact about Radix UI's `Select` component's behavior (confirmed this codebase genuinely uses `@radix-ui/react-select` under the shadcn wrapper). I had not actually verified that claim against the library's behavior, and I don't have its source available in this sandbox to check it directly — many `Select` implementations don't re-fire `onValueChange` when the already-selected value is clicked again, and I can't currently prove which way this one behaves. I should not have stated it as established fact. Retracting that specific mechanism from this finding. It doesn't weaken the core claim at all — the verified fact that selecting "Collaborative" forces a courtroom swap stands entirely on its own, fully demonstrated directly from the code with no assumption about UI library internals required.

### The right way to think about the fix
The cleanest framing: `courtMode` should choose *who speaks* (which four personas), and `debateMode` should choose *how they speak* (the interaction style among whichever four are already chosen) — two independent settings, not one masquerading as a simplified view of the other. Right now only the first concept is real; the second is declared in the type and shown in the UI but has no actual behavioral implementation anywhere. Three honest ways to resolve that, in descending order of how much new work they require:
1. **Build real `debateMode` logic into `brainEngine.ts`** — actually vary each persona's instruction text based on `adversarial` ("challenge previous arguments, attack weaknesses, seek contradictions") versus `collaborative` ("build on previous arguments, strengthen prior evidence, seek synthesis"), independently of which `courtMode` is active. This is the only option that makes combinations like "Critique court + Collaborative debate" or "Socratic court + Adversarial debate" actually possible, and it's the only one that makes the current UI's description text true.
2. **Remove `debateMode` entirely** and expose `courtMode` directly as a real four-option selector in `Session.tsx` (mirroring what `Settings.tsx`'s `PreferencesTab` already has) — acceptable if collaborative-vs-adversarial interaction style was never meant to be a real, separate dimension.
3. **Keep the code exactly as it is, fix only the words** — rename the control and rewrite its description so it accurately says "Adversarial Court" / "Analysis Court" rather than implying a behavioral toggle. This is the cheapest fix and the one I'd recommend against if it's the only one chosen, since it leaves the hidden coupling in place under an honest label rather than removing the coupling — it solves the documentation mismatch without solving the design problem underneath it.

I haven't implemented any of these — this is a product decision about whether collaborative-vs-adversarial interaction style is meant to be a real, independent feature or was always just a simplified two-option proxy for picking between two of the four court modes. The three options above produce meaningfully different products; I don't think it's mine to choose.

### A related, softer finding I want to correct from earlier in this same pass
Partway through this pass I initially concluded `socratic` mode was completely unreachable from the frontend — no template sets it, and this toggle can't produce it. That's still true *for the live Session page*, but `Settings.tsx`'s `PreferencesTab` (read later in this same pass) has a direct four-option `courtMode` selector, including Socratic, saved as the user's account-level default — confirmed this value flows into `Session.tsx` via `userProfile.defaultSettings.courtMode` → `savedConfig` → `useBrainSession`'s initial state. So `socratic` mode is reachable, just only as a sticky default set from a different page, never as a live in-session choice. The real bug isn't "Socratic is dead" — it's that three of the four court modes can be changed live from the session page and one can't, and the one live control that exists (Debate Mode) actively damages whichever of the other three modes a user arrived with.

### What I'd want before fixing this
This needs a product decision on what "Debate Mode" is actually supposed to mean, not just a code fix — is it meant to be a real behavioral toggle within whatever `courtMode` is already active (in which case it shouldn't touch `courtMode` at all, and `brainEngine.ts` would need real logic to make litigants "build on each other" within adversarial/critique/analysis/socratic alike), or is it meant to be a simplified two-option proxy for picking between just two of the four real modes (in which case the description text is what's wrong, and it should say so plainly, not imply something narrower and less destructive than what it does)? Either fix is straightforward once that's settled; I haven't picked one since it's a real design question, not an implementation bug with one obvious correct shape.

---

## What I verified and found clean / consistent with prior passes

- **`ConfigPanel`'s admin-only sub-label on the Landing Page artifact option** — matches `replit.md`'s documented "Admin-only UI Gating" section exactly (the fifth specific claim from that doc to check out precisely against real code across this audit).
- **`SeatInspector.tsx`** — confirmed at the component level what Pass 4's Finding #11 already established structurally: this is where a user actually picks "Litigant 7," sees a real grade badge, and clicks "Assign Claude" — with no awareness anywhere in this component that seats past index 3 never execute. Direct UI-level confirmation of an existing finding, not a new one.
- **"Maximum Credits" field** — a fixed dropdown (10/15/25/50/100), no arbitrary input possible, so no validation gap. Worth knowing as context for Pass 1/9's findings: given a typical session now costs ~83 credits with the corrected estimate, the 10/15 options would trigger the credit-cap early-stop almost immediately — not a bug, but a real consequence of those earlier findings that's worth knowing when those get fixed (these dropdown options may need recalibrating at the same time).
- **`PreferencesTab`'s confidence-target slider range (60-95)** vs. `auth.ts`'s actual server-side validation range (50-99, confirmed by re-reading the route directly) — the UI range is narrower than what the server accepts, which can't produce an invalid value, so this isn't a bug. Noting it as another instance of the same constraint being defined in two places with no shared source, the same recurring pattern as Pass 2 #5 / Pass 3 #8 / Pass 9 #27, just one where the mismatch happens to be harmless.

---

## Where to pick this up next
`Settings.tsx`'s `NotificationsTab` has not been reviewed at all yet — low risk (likely just boolean toggles for email preferences), worth a quick check rather than a full pass on its own, but it should stay on the unread list until that happens rather than be assumed clean. After that: `Admin.tsx`'s full remaining frontend (the largest single remaining file, ~2,400 lines, gets its own dedicated pass as planned), then `Landing.tsx` + `ShareReport.tsx`, then the tools pages and remaining shared components (`AppLayout.tsx`, `CourtDiagram.tsx`, `LandingDemoPlayer.tsx`, `OnboardingWizard.tsx` — the last one specifically needs a fresh look since an earlier, different-codebase conversation touched its litigant-count list and that fix should be re-verified against this actual zip rather than assumed).
