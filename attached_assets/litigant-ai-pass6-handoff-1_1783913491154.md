# Litigant AI — Admin Panel Usability Audit — Pass 6 Handoff
**Scope:** `Admin.tsx` (3,001 lines), reviewed specifically through a mobile/one-finger-touch usability lens, per your direction — you're the admin, using it mostly from a phone with limited dexterity. Security/money issues noted opportunistically as in prior passes, but usability is the primary filter this pass.
**Depth:** Deep review of Overview, Users (+ its two modals), Pricing (MultiplierCell), API Keys (row actions), and Feature Flags tabs, plus a full-file sweep for touch-hostile patterns (hover-only reveals, drag/drop, mouse-only events, native `confirm()`). Not yet deep-reviewed: Sessions, Transactions, API Usage, Error Logs, Abuse Flags, Credit Packs, Limits, Templates, Checklist, System Health tabs — queued for Pass 7 if you want full coverage.

---

## Finding 15 — Three Critical Admin Actions Are Invisible on Touchscreens

**Priority: High for your actual use case.** This is the one that would directly block you, specifically, from using the app the way you need to.

**The pattern, three instances, verified via full-file grep for `group-hover:opacity`:**

1. **`Admin.tsx` line 2460 — API Keys tab.** The Edit button and Delete/Reset button for every configured provider API key are wrapped in `opacity-0 group-hover:opacity-100`. They only become visible when a mouse cursor hovers over the row.
2. **`Admin.tsx` line 2769-2772 — Pricing tab.** The edit button for a model's credit multiplier (the pencil icon next to each multiplier value) has the identical `opacity-0 group-hover:opacity-100` treatment.
3. **`Admin.tsx` line 2774-2777 — Pricing tab.** The "reset to default" button for an overridden multiplier has the same treatment.

**Why this matters specifically for you:** touchscreens have no hover state. A mouse user sees these buttons appear as they move their cursor over a row; on your phone, there's no cursor to hover with, so these buttons stay at `opacity-0` — invisible — permanently. Nothing in CSS blocks a tap from technically landing on an invisible element (opacity doesn't disable clicks by default), but that's irrelevant in practice: there is no way to see that a 14×14px edit icon exists at a specific spot in a table row, let alone tap it precisely, without ever seeing it.

**Precise statement of what's blocked (correcting my earlier wording):** the Edit action exists for every configured provider key. The Reset/Delete action only renders at all when the key's source is Firestore (`info.source === "firestore"`, line 2464) — environment-variable-sourced keys intentionally don't get a delete action in this row, which is correct by design, not a bug. So the accurate statement is: *you currently cannot reliably discover or use the API-key Edit action, and you cannot reliably discover or use the Firestore-key Reset/Delete action, from a touchscreen* — not a blanket "can't edit or reset API keys."

**A second, compounding problem on these same three buttons — verified via a full-file check for `aria-label`: there are zero in the entire file.** All three buttons render icon-only with no `aria-label` and no visible text (`<Edit3 />`, `<RotateCcw />`). Beyond the hover-invisibility, this means the controls have no accessible name at all — a screen reader would announce nothing meaningful, and even once visible (after the fix below), a sighted user has to infer "pencil icon = edit" with no label to confirm it. Worth fixing at the same time as the hover issue since you're already touching this code.

**Touch-target size also needs correcting, not just visibility.** I under-stated this originally. The API-key buttons are `h-7 px-2` — about 28px tall. The pricing buttons are worse: plain `<button>` elements with only a 14×14px icon and no padding or minimum size at all. Even with `opacity-0` removed, these remain too small for reliable one-finger tapping — the fix needs to address size and accessible naming together, not just visibility. Recommended minimums: 44×44px touch target, ≥8px spacing between adjacent destructive/non-destructive actions, and visible focus styling preserved for keyboard use.

**Recommended fix — API Keys row (line 2461-2467), addressing all three problems together:**
```tsx
<Button
  size="sm" variant="ghost"
  className="h-11 min-w-11 px-3 opacity-70 hover:opacity-100 focus-visible:opacity-100"
  onClick={() => onEdit(info)}
  aria-label={`Edit ${info.label} API key`}
>
  <Edit3 className="w-4 h-4" />
</Button>
{info.source === "firestore" && (
  <Button
    size="sm" variant="ghost"
    className="h-11 min-w-11 px-3 text-destructive opacity-70 hover:opacity-100 focus-visible:opacity-100"
    onClick={() => onDelete(info)}
    aria-label={`Reset ${info.label} API key to environment configuration`}
  >
    <RotateCcw className="w-4 h-4" />
  </Button>
)}
```
Apply the same treatment (permanent visibility, 44px minimum, `aria-label`) to the Pricing tab's multiplier edit and reset buttons.

**Bottom line correction to my earlier framing:** this isn't "three small class-name changes." Making these actions permanently visible is a small change; making them genuinely usable also means fixing their size and giving them accessible names, which is a slightly bigger but still contained fix.

---

## Finding 16 — Mobile Bottom Tab Bar Compresses 15 Tabs Into One Row (Correcting My Tab Count and CSS Analysis)

**Priority: Medium.**

**File:** `Admin.tsx` lines 2951-2965.

**Correction to my earlier count:** there are **15 tabs**, not 14 — I miscounted. Full list, verified directly from the `TABS` array (lines 59-73): Overview, Setup Checklist, System Health, Pricing, API Keys, Users, Sessions, Transactions, API Usage, Error Logs, Abuse Flags, Credit Packs, Limits, Feature Flags, Templates.

**Correction to my earlier CSS analysis — this is the more important fix.** I originally framed this as "cramped tabs, or reliance on horizontal scroll." That's not quite right. The actual button classes are `flex flex-col items-center gap-0.5 px-3 py-2 text-xs min-w-0 flex-1`, inside a container with `flex overflow-x-auto`. The combination of `flex-1` and `min-w-0` explicitly *permits* every button to shrink below its natural content width — there's no minimum width forcing overflow. So the realistic outcome isn't a scrollable strip; it's **all 15 buttons compressing to fit the viewport**, roughly 390px ÷ 15 ≈ 26px per tab before borders, on a typical phone screen. Labels are already set to `truncate`, so at that width most tab labels will be unreadable, and the icons themselves are only 16×16px. `overflow-x-auto` is present in the code but doesn't actually help, because nothing forces the children to be wider than the available space in the first place.

**Recommended solution — a short fixed set plus a "More" sheet, not a wider scroll strip:**
- Keep 4-5 of your most-used tabs fixed in the bottom bar (my suggestion: Overview, Users, Sessions, Pricing) plus a "More" button.
- "More" opens a full-height or bottom-sheet menu listing the remaining tabs as large, fully-labeled rows — minimum 48px height each, icon + full text (no truncation), clear indication of which tab is currently active.
- This replaces both precision-tapping on 26px targets *and* sideways scrolling with large, unambiguous single taps — a better fit for your situation than either of the two alternatives.

**A lower-effort fallback, if the "More" sheet is more than you want to build right now:** give each tab button a real minimum width instead of letting it shrink to nothing —
```
className="flex flex-col items-center gap-1 px-3 py-2 text-xs min-w-[72px] shrink-0"
```
This would make `overflow-x-auto` actually functional (a genuine horizontally-scrollable strip instead of 15 squeezed icons), which is still worse than the "More" design but meaningfully better than the current behavior.

---

## Finding 18 — Content Area Padding Wastes Mobile Width

**Priority: Medium.**

**File:** `Admin.tsx` line 2968: `<div className="flex-1 min-w-0 px-6 py-8 pb-24 lg:pb-8 max-w-5xl">` — verified this exact padding applies at every viewport size; there's no smaller `px-` value for mobile, only `pb-24 lg:pb-8` varies by breakpoint.

**Why this matters:** `px-6` is 24px of padding on each side — on a 390px-wide phone, that's roughly 48px total consumed before any card border or internal padding, leaving about 342px of actual usable width. This is a real cost specifically on the tabs with tables (Users, Sessions, Transactions, API Usage, Error Logs, Abuse Flags, Credit Packs, Pricing) — the shared `Table` component correctly wraps tables in its own `overflow-auto` div so they scroll rather than break the page (confirmed good, not a bug), but the outer 24px-per-side padding unnecessarily shrinks how much of each table is visible before scrolling is needed, meaning more swiping to see the same data.

**Recommended fix:** make the padding responsive instead of fixed:
```tsx
<div className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 pb-24 lg:pb-8 max-w-5xl">
```
This recovers about 24px or more of usable width on your phone specifically, while leaving the desktop layout unchanged. Worth applying the same lighter padding inside table cards and modal bodies where practical, for the same reason.

---

## Confirmed Good — Patterns Already Working Well for Your Situation

Worth knowing what's *already* right so you're not second-guessing it:
- **Credit Adjust modal** (`Admin.tsx` line 823-829): the amount field uses `type="number"`, which triggers your phone's numeric keypad instead of a full keyboard — meaningfully fewer taps than a text field.
- **Ban/Unban flow**: 3 taps total (open row menu → "Ban user" → confirm), no required typing — the reason field is optional.
- **Users table**: the entire row (not just a small button) is the tap target for the primary action (view profile) — a generous, deliberate touch target choice.
- **Feature Flags tab**: real toggle switches (`Switch` component, always visible) and a native `<select>` for plan scope, which opens your phone's own picker UI — both ideal for touch.
- No native `confirm()` dialogs, no drag-and-drop anywhere in the file, no critical information hidden behind tooltip-only reveals.

**One small proactive suggestion, not a bug:** the Credit Adjust modal requires typing an exact number every time (e.g. "50" or "-10"). A row of quick-preset buttons (+10 / +50 / +100 / −10) alongside the manual field would cut this down to a single tap for your most common adjustments, without removing the manual option for anything else. Worth considering if you find yourself adjusting credits often.

---

## Not Yet Reviewed (queued for Pass 7)
Sessions, Transactions, API Usage, Error Logs, Abuse Flags, Credit Packs, Limits, Templates, Checklist, and System Health tabs haven't had the same close pass yet. Given Finding 15 was isolated to just two tabs out of the six I did review, my expectation is the rest are more likely clean than not — but that's an expectation, not a verified claim, and I'd want to actually check before telling you it's safe.
