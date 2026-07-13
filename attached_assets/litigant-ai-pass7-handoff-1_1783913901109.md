# Litigant AI — Admin Panel Usability Audit — Pass 7 Handoff
**Scope:** The remaining 10 tabs of `Admin.tsx`: Sessions, Transactions, Credit Packs, Limits, Templates, Checklist, System Health, API Usage, Error Logs, Abuse Flags. Combined with Pass 6, **all 15 admin tabs have now been reviewed** (corrected count — Pass 6 originally miscounted 14) — full coverage, not a sample.
**Method:** Same usability-first lens as Pass 6, security/money issues noted opportunistically.

---

## Finding 17 — Credit Pack Deactivation Has No Confirmation Step

**Priority: Medium-High.** This is the one real risk this pass, and it's a fat-finger risk specifically.

**File:** `Admin.tsx`, Credit Packs tab, lines 1439-1446. The "Deactivate" button fires immediately on tap: `onClick={() => deactivateMut.mutate(pack.id)}` — no confirmation dialog, no "are you sure."

**Why this matters for you specifically:** deactivating a pack immediately removes it from the customer-facing Billing page — a real, live product going offline with one tap. The button sits directly next to "Edit" (same row, same size, both small `h-7` ghost buttons with a 3px icon). A single mis-tap on a phone — hitting Deactivate instead of Edit, or vice versa — takes a real revenue-generating product offline with zero opportunity to catch it before it happens. It's reversible (there's a "Reactivate" button for deactivated packs, confirmed in the same tab), but only *after* you notice, and in the meantime it's simply not purchasable.

**Worth noting the inconsistency:** the Ban User flow (Users tab, reviewed Pass 6) has a full confirmation modal for an action of comparable severity. This one doesn't. There's no structural reason for the difference — just an omission.

**Recommended fix:** add the same lightweight confirm pattern already used for Ban — a small dialog with "Deactivate [pack name]?" and a confirm button, one extra tap, consistent with the rest of the panel's destructive-action pattern.

---

## Everything Else — Confirmed Clean, Full Coverage

With this pass, I've now read every one of the 14 admin tabs end to end. Summary:

- **Sessions, Transactions, API Usage, Error Logs, Abuse Flags:** all either pure read-only displays or have full-row/always-visible tap targets. No hover-gating, no typing required beyond optional filter fields (user ID, template ID — advanced/optional, not blocking).
- **Refund modal** (Transactions tab): numeric-keypad amount field, same good pattern as Credit Adjust.
- **Credit Packs create/edit dialog:** well-built — numeric fields use the phone keypad, live rate calculation feedback, correctly disables the immutable pack-ID field on edit.
- **Limits tab:** uses a +/− stepper (tap-repeatable, no typing at all) for `maxLitigants` — genuinely one of the better patterns in the file for your situation. Side note, not a new finding: its description text ("Default: 10. Range: 2–20") is yet another independent confirmation of the ongoing litigant-cap mismatch from Findings 4/7 — worth knowing it's visible right in your own admin UI.
- **Billing Defaults section:** mostly numeric-keypad fields; one free-text comma-separated field for auto-refill preset amounts (low-frequency action, minor).
- **Templates tab:** always-visible edit button + `Switch` toggle for active/inactive, no hover-gating. Edit modal's system-prompt field is a `Textarea` — inherently more substantial text entry, but that's the nature of writing/editing a prompt, not a design flaw, and works fine with voice-to-text.
- **Checklist tab:** real `Checkbox` components, `Accordion` for step-by-step instructions (good collapsible pattern rather than a wall of always-shown text).

**On Finding 15 (the hover-invisible buttons from Pass 6):** having now read the entire file, I can confirm those three instances (API Keys edit/delete, Pricing multiplier edit/reset) are the *only* occurrences of that bug in all of `Admin.tsx` — not a sample-based guess anymore, a completed sweep.

---

## Admin Panel Usability Audit: Complete

Between Pass 6 and Pass 7, all 15 tabs have been reviewed (corrected count — Pass 6 originally miscounted 14). Running total of usability findings:
- **Finding 15** (Pass 6, corrected/expanded): hover-only invisible buttons on API Keys edit/delete and Pricing multiplier edit/reset — also missing accessible names (zero `aria-label`s anywhere in the file) and undersized touch targets (28px or smaller). High priority, contained fix.
- **Finding 16** (Pass 6, corrected): mobile bottom bar compresses all 15 tabs to ~26px each rather than scrolling, since `flex-1 min-w-0` lets them shrink instead of forcing overflow. Recommended fix is a short fixed set + "More" sheet, not just a wider scroll strip. Medium priority.
- **Finding 18** (Pass 6): main content area's fixed `px-6` padding costs ~48px of usable width on a phone at every viewport size. Medium priority, easy responsive-padding fix.
- **Finding 17** (this pass): Credit Pack deactivation has no confirm step, sits next to Edit. Medium-high priority.

Four real, scoped, fixable issues out of a genuinely well-built admin panel — the numeric-keypad inputs, full-row tap targets, toggle switches, native selects, and stepper patterns used throughout show this was built with real care already. This isn't a rewrite; it's four targeted fixes, three of them concentrated in the same two tabs (API Keys, Pricing) plus the shared navigation shell.
