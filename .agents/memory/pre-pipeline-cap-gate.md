---
name: Pre-pipeline cap gate
description: Credit cap now stops spending BEFORE the fixed pipeline (not after). Architecture of the pause/resume flow for credit_cap_pre_pipeline.
---

# Pre-pipeline cap gate

## The rule
When a user's credit cap is hit during the debate loop, the session stops BEFORE running the fixed pipeline (Moderator → Architect → Builder → Auditor → Verdict). Previously the pipeline ran even after cap exhaustion.

**Why:** Finding 6 of the Money/Credits audit — the hard spending cap must gate spending before the pipeline, not after.

## How it works

### brainEngine.ts
- Debate loop is now wrapped in `if (!opts.resumeWithFixedPipeline)`
- After the loop, a `creditCapHit` gate emits `paused_pre_pipeline` SSE and returns early with `pausedPrePipeline: true`, `pauseReason: "credit_cap_pre_pipeline"`, `fixedStageTokens: {0,0}`
- `PauseReason` union includes `"credit_cap_pre_pipeline"`
- `BrainRunOptions` has `resumeWithFixedPipeline?: boolean`
- `BrainRunResult` has `pausedPrePipeline?: boolean`

### brain.ts
- Accepts `resumeWithFixedPipeline` from request body
- When `resumeWithFixedPipeline: true`, uses `estimateFixedPipelineCost()` (not full session estimate) for the reservation — avoids over-reserving on cap-raise resume
- Passes flag to `runBrainSession`
- Sets Firestore `status: "paused_pre_pipeline"` when `result.pausedPrePipeline`

### creditEngine.ts
- New `estimateFixedPipelineCost(model?)` — sync function, uses `FIXED_STAGE_PRIOR` tokens only

### sessionService.ts (frontend)
- `PauseReason` includes `"credit_cap_pre_pipeline"`
- `BrainRunRequest` has `resumeWithFixedPipeline?: boolean`
- `SSEEventType` includes `"paused_pre_pipeline"`
- `SSEEvent` has `debateTranscriptLines?: string[]`
- SSE reader resolves promise on `paused_pre_pipeline` (same as `done`)
- `resumeWithFixedPipeline` included in JSON body

### useBrainSession.ts
- New `PAUSED_PRE_PIPELINE` action type + reducer case (sets `pauseReason: "credit_cap_pre_pipeline"`, stores `pauseTranscript`)
- SSE handler dispatches `PAUSED_PRE_PIPELINE` on `paused_pre_pipeline` events
- `continueSessionFn(newMaxCredits?: number)` — when `pauseReason === "credit_cap_pre_pipeline"`, sends `resumeWithFixedPipeline: true` and updated config with new cap

### Session.tsx
- Pause card shows different UI for `credit_cap_pre_pipeline`: description text + credit-cap number input (defaulting to current cap + 30) + "Continue to verdict" button (passes new cap) + "Accept debate only"

## Calibration safety
Paused-pre-pipeline sessions return `fixedStageTokens: {input:0, output:0}`. The calibration query in creditEngine.ts already filters `r.input > 0 && r.output > 0`, so these sessions never corrupt the calibration data.
