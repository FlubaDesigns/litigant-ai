# Litigant AI — Architectural Addendum (Verified)
**Checked each item below against actual source before including it. Two items describe something that already exists — just built differently than proposed — and one has a dependency the original write-up missed. Corrected accordingly.**

---

## 9. Centralize AI Provider & Model Metadata — CONFIRMED, but this is the same fix as items 1–3 & 7 from the naming handoff, not a new one

This is real and worth doing, but it's not a new finding — it's the same root cause already documented: `seatTypes.ts` (`SEAT_AI_OPTIONS`) and `SeatInspector.tsx` (`defaultModels`) both hand-roll provider metadata that duplicates what `artifacts/api-server/src/lib/providers/types.ts` already defines and serves via `GET /providers`. `providerService.ts` and `Session.tsx` already consume that correctly.

**Don't scope this as new work — it's the same edit as before.** Fixing items 1–3 (delete the two duplicate maps, wire `SeatInspector.tsx` to `getProviders()`) *is* the centralized registry. No separate task needed. The registry fields you listed (icon, cost tier, reasoning tier, enabled/disabled, admin visibility) can be added to the existing `PROVIDER_MODELS`/`PROVIDER_DISPLAY_NAMES` shape in `types.ts` rather than building a new structure from scratch.

---

## 10. Admin-Controlled Intelligence Slider Mapping — ALREADY BUILT, differently than described

**This isn't a planned feature — it's live today**, and it's more flexible than what's proposed. Worth checking before implementing the doc's version, because building it as described would be a step backward.

**What exists now:** every model in `PROVIDER_MODELS` (`types.ts`) has a `qualityScore` (0–100, e.g. GPT-5 = 90, Claude Opus 4.5 = 92, Claude Haiku 4.5 = 42). The Session Configuration slider (`Session.tsx` line 567) is a continuous 0–100 control — not five fixed positions. `providerService.ts` (`pickModelForLevel`, line ~51–70) picks whichever model's `qualityScore` is numerically closest to the slider value, per provider. Admins already edit these scores with no code deploy, through the AI Studio tab in `Admin.tsx` (line 3132) → `setModelQualityScore()` → `PATCH /admin/ai-studio/models/:modelId`.

**So the admin-control requirement is already satisfied** — just via a continuous score per model rather than five named tiers per provider. The proposed "Lower Cost / Economy / Balanced / Better Answers / Maximum Reasoning" labels would require collapsing this continuous system down to 5 fixed buckets, which is strictly less flexible than what's there (an admin can currently place a new model at, say, 63 without needing to also decide which discrete bucket it "counts as"). **Recommendation: keep the continuous score system, and if named labels are wanted for UI purposes, render them as computed bands over the existing 0–100 scale** (e.g., 0–30 = "Lower Cost," 30–55 = "Economy," etc.) rather than rebuilding the underlying mechanism.

---

## 11. Standardize Provider / Model / Seat Terminology — CONFIRMED, same root cause as #9

Also not new — this is the exact issue already documented in the naming handoff (`SEAT_AI_OPTIONS` showing "GPT-4o" where a provider name belongs; "Assigned AI" label renamed to "AI Provider"). Fixing items 1–3, 5 already accomplishes this. No separate work item needed here either.

---

## 12. Display Active Conscience Version — feasible, but has a dependency the write-up didn't mention

The data genuinely exists: `GET /admin/conscience` already returns a `version` field (either the Firestore-stored version or `CANON_V2_FALLBACK_VERSION`), and `PATCH /admin/conscience` lets an admin set a custom version string alongside the text (`admin.ts` lines 1159–1221). So the underlying capability is real.

**The gap:** `GET /admin/conscience` is mounted behind `requireAdmin` (line 1159). Session Configuration is a regular user-facing screen — a normal user's browser can't call an admin-gated endpoint to read the current version for display. **This needs a small new public endpoint** (e.g. `GET /conscience-version`, no auth or basic auth only, returning just `{ version }` — not the full text, so the actual mandate wording stays admin-only) before this can be wired into Session Configuration. This should be scoped together with item #3 (build the admin editor) since they touch the same backend file.

---

## 13. Provider Failover Support — confirmed net-new, nothing to build on

Checked for any existing failover/fallback-provider logic — there is none. `brainEngine.ts` has only a generic per-call error string (`` `[${err?.message || "Provider error"}]` ``) with no retry-on-different-provider behavior. This is accurately described as new work, not a fix to something partially built. Worth noting for scoping: this will need decisions the doc doesn't cover yet — does a mid-debate failover swap providers for the whole session or just the next turn, and does the credit/cost estimate shown to the user need to account for a fallback model potentially costing a different amount than the one they picked.

---

## Summary for Rep

- **Items 9 and 11 are not separate tasks** — they're accomplished by items 1–3 and 5 from the naming handoff. Don't double-schedule this work.
- **Item 10 already exists.** Don't build the 5-tier version as literally described — it would replace a more flexible system with a less flexible one. If discrete labels are wanted in the UI, compute them as display bands over the existing continuous score.
- **Item 12 needs one small new public endpoint** before it can be built as described — flag this to whoever scopes the ticket so it's not discovered mid-implementation.
- **Item 13 is genuinely new** and needs a design decision on failover scope (per-turn vs. per-session) before implementation starts.
