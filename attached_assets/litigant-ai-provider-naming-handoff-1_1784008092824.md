# Litigant AI — Provider Naming & Default Model Fixes
**Handoff for Rep. Every finding below was verified against actual source lines before being included.**

---

## Background (read this first)

There are **three separate places** in the frontend/backend that define provider display names and default models. One of them is correct and already live. The other two are stale hand-written duplicates that never got updated. Fix all three items below and the whole naming problem goes away — they are not independent bugs, they all trace back to the same duplication.

The **correct, authoritative source already exists and is already working**:
- `artifacts/api-server/src/lib/providers/types.ts` — `PROVIDER_DISPLAY_NAMES`, `DEFAULT_MODELS`, `PROVIDER_MODELS`
- Exposed via `GET /providers` in `artifacts/api-server/src/routes/providers.ts`
- Already consumed correctly by `artifacts/gh-brain/src/services/providerService.ts` (`getProviders()`, `PROVIDER_LABELS`, `PROVIDER_ICONS`)
- Already used correctly in `artifacts/gh-brain/src/pages/app/Session.tsx` line 573, which displays **"OpenAI"**

**Do not build a new config system. It's already built. Just point the broken pieces at it.**

---

## Issue 1 — Seat picker shows "GPT-4o" instead of "OpenAI"

**File:** `artifacts/gh-brain/src/data/seatTypes.ts`, lines 1–31 (`SEAT_AI_OPTIONS`)

Current state — three of four entries use provider names, one uses a model name:
```
anthropic → "Claude"
openai    → "GPT-4o"   ← wrong, this is a model, not the provider
grok      → "Grok"
gemini    → "Gemini"
```

**Fix:** Change `name: "GPT-4o"` to `name: "OpenAI"` on line 11.

**Proof this is visibly inconsistent today:** `artifacts/gh-brain/src/pages/app/Session.tsx` line 573 uses the *correct* source (`PROVIDER_LABELS`) and already shows "OpenAI" for the exact same provider, in the same app. Only the seat-level picker (which reads `SEAT_AI_OPTIONS` instead) shows "GPT-4o." A user switching between the session-level selector and the per-seat selector currently sees two different names for the same AI.

---

## Issue 2 — Seat picker default model doesn't match backend default

**File:** `artifacts/gh-brain/src/components/SeatInspector.tsx`, lines 96–101

Current state — this component has its own hardcoded `defaultModels` map:
```ts
const defaultModels: Record<string, string> = {
  anthropic: "claude-opus-4-5",   // ← wrong
  openai:    "gpt-5",
  grok:      "grok-3",
  gemini:    "gemini-2.5-pro",
};
```

Compare to the actual backend source of truth, `artifacts/api-server/src/lib/providers/types.ts` lines 30–35:
```ts
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5",
  anthropic: "claude-haiku-4-5",  // ← this is what actually gets used server-side
  grok: "grok-3",
  gemini: "gemini-2.5-pro",
};
```

**This is a real bug, not just a naming risk.** If a seat's provider is set through this UI, it defaults to Claude **Opus**. If the same seat falls back to the backend default (e.g., no model specified), it uses Claude **Haiku**. Same provider, two different models, two different costs, depending on which code path set it.

**Fix:** Delete the local `defaultModels` map in `SeatInspector.tsx`. Replace `defaultModels[selectedProvider]` with the `defaultModel` field already returned by `GET /providers` (available via `getProviders()` in `providerService.ts`, same pattern `Session.tsx` already uses at line 216 / 1080).

---

## Issue 3 — Duplicate default-model definitions (root cause of Issues 1 & 2)

Confirmed duplicate, hardcoded maps exist in:
- `artifacts/gh-brain/src/data/seatTypes.ts` (`SEAT_AI_OPTIONS`)
- `artifacts/gh-brain/src/components/SeatInspector.tsx` (`defaultModels`)

The correct single source is `artifacts/api-server/src/lib/providers/types.ts` (`DEFAULT_MODELS`, `PROVIDER_DISPLAY_NAMES`, `PROVIDER_MODELS`), already served at `GET /providers`, already consumed correctly by `providerService.ts` and `Session.tsx`.

**Fix:** Same as Issues 1 & 2 — remove `SEAT_AI_OPTIONS` and `defaultModels`, wire `SeatInspector.tsx` to `getProviders()` / `PROVIDER_LABELS` instead. No new config needed.

---

## Issue 4 — Session config wording is inaccurate

**File:** `artifacts/gh-brain/src/pages/app/Session.tsx`, line 556

Current text (verified verbatim in source):
> "Which underlying AI model powers every seat in this session."

This is inaccurate once per-seat overrides exist (they already do, via `SeatInspector.tsx`).

**Fix:** Replace with:
> "This establishes the default AI provider and model for the session. Individual courtroom seats may be configured independently."

---

## Issue 5 — "Assigned AI" label should read "AI Provider"

**File:** `artifacts/gh-brain/src/components/SeatInspector.tsx`, line 164

Current text (verified verbatim in source): `Assigned AI`

**Fix:** Change label text to `AI Provider`. The exact selected model should continue to display underneath, using the same `defaultModel`/model data pulled from `getProviders()` per Issue 2's fix — don't hardcode it a third time.

---

## Issue 6 — Internal provider IDs — NO ACTION NEEDED

Checked: `id: "openai"`, `"anthropic"`, `"grok"`, `"gemini"` are already preserved as internal identifiers everywhere, independent of display name. Changing display names in Issues 1–5 does **not** touch these IDs. No migration risk. Confirmed safe.

---

## Issue 7 — Frontend should support future providers dynamically

Already true on the backend side: `GET /providers` in `artifacts/api-server/src/routes/providers.ts` already returns whatever providers are configured (via `getConfiguredProvidersAsync()`), with `displayName`, `defaultModel`, and `models` per provider — no frontend code change needed to add DeepSeek/Mistral/etc. at the backend level.

The only thing currently blocking this is Issues 1–3: `SEAT_AI_OPTIONS` in `seatTypes.ts` is a hardcoded 4-item array, so a 5th provider added on the backend won't show up in the seat picker until `SeatInspector.tsx` is switched over to `getProviders()`.

**Fix:** Same fix as Issues 1–3 covers this automatically. No separate work required.

---

## Issue 8 — Seat structure (single vs. multiple litigant seats) — NO ACTION NEEDED

Confirmed: none of the fixes above touch seat count, seat indexing, or the single/multi-litigant structure. `SEAT_AI_OPTIONS` only supplies display data, not structural seat logic. Safe to proceed with Issues 1–3 without affecting seat architecture.

---

## Summary for Rep

**Files to touch:**
1. `artifacts/gh-brain/src/data/seatTypes.ts` — fix line 11 label OR delete file entirely if Issue 3 fix removes all its usages
2. `artifacts/gh-brain/src/components/SeatInspector.tsx` — remove local `defaultModels` map, remove `SEAT_AI_OPTIONS` usage, wire to `getProviders()`/`PROVIDER_LABELS`, change "Assigned AI" → "AI Provider" (line 164)
3. `artifacts/gh-brain/src/pages/app/Session.tsx` — reword line 556 only

**Files to leave alone:** everything related to internal provider IDs and seat/litigant structure — already correct.
