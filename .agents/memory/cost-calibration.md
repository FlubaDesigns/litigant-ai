---
name: Canonical session cost calibration
description: How the session cost estimate works — one source of truth, self-calibrating from real session data.
---

## The rule
There is ONE canonical cost function. Both the credit reservation (brain.ts) and the admin pricing table (pricingConfig.ts) call into it. Never hardcode token counts in two places.

**Why:** The old codebase had `EXAMPLE_INPUT = 13_000` / `EXAMPLE_OUTPUT = 5_600` in pricingConfig.ts AND a separate formula in creditEngine.ts. Both missed 4 of the 8 pipeline stages. Admin table showed 45 credits for a session that actually cost ~85 — a 47% understatement. Fixing one didn't fix the other.

## How to apply
- **`creditEngine.ts`** owns the math:
  - `FIXED_STAGE_PRIOR` — baseline for 5 fixed stages (Mod + Arch + Builder + Auditor + Verdict) at ~70% fill
  - `variableTokens(config)` — variable part (orchestrator open + litigant rounds)
  - `estimateSessionCredits(config)` — sync, uses prior; safe for frontend sliders
  - `estimateSessionCreditsCalibrated(config)` — async, uses real data; use for reservation + admin display
  - `getCalibratedFixedStageTokens()` — queries `sessions` collection, `orderBy("createdAt","desc").limit(50)`, averages `fixedStageTokens` field; 5-min cache; falls back to prior if <5 sessions have the field

- **`brainEngine.ts`** snapshots `usage` after the debate loop (`usageAfterDebate`) and returns `fixedStageTokens = { input: delta, output: delta }` in `BrainRunResult`.

- **`brain.ts`** saves `fixedStageTokens` to the Firestore session document. This is the data `getCalibratedFixedStageTokens()` reads.

- **`pricingConfig.ts`** calls `getCalibratedFixedStageTokens()` to build `EXAMPLE_INPUT`/`EXAMPLE_OUTPUT` instead of using hardcoded constants.

## Calibration thresholds
- `CALIBRATION_MIN_SESSIONS = 5` — prior used until this many sessions have `fixedStageTokens`
- Cache TTL = 5 minutes (same pattern as conscienceConfig.ts and seatBriefs.ts)
- Fires a single Firestore query, not one per estimate

## Adding a new pipeline stage
1. Update `FIXED_STAGE_PRIOR` to include the new stage's max output × 0.7 in `.output` and estimated context in `.input`.
2. The system will self-correct after 5 new sessions run — the hardcoded prior is just a starting point.
