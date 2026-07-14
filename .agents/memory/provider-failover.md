---
name: Provider failover
description: How silent session-level provider failover is implemented across brainEngine, brain route, and frontend.
---

## Rule
When an AI provider errors mid-run, brainEngine silently switches the whole session to the next configured provider and emits one `provider_failover` SSE event. The frontend pins all subsequent turns to the backup.

**Why:** User wanted whole-session scope (not per-turn), silent retry — no user notification.

## How to apply

**Backend — brainEngine.ts:**
- `streamRole` throws `ProviderFailureError` instead of returning an inline error string.
- `callRole` closure (inside `runBrainSession`) catches `ProviderFailureError`, calls `triggerFailover(failedName)`, retries with `globalProvider`.
- `triggerFailover` picks `configured.find(n => n !== failedName)`, swaps `globalProvider` + any seat provider that matched the failed one, emits `{ type: "provider_failover", provider: backupName }` SSE.
- `BrainRunOptions.forcedProvider?: string` — when set, `resolveProvider` uses it instead of `config.provider` (client sends this on subsequent turns).

**Backend — brain.ts:**
- Extracts `failoverProvider` from request body, passes as `forcedProvider` to `runBrainSession`.

**Frontend — sessionService.ts:**
- `BrainRunRequest.failoverProvider?: string` field; included in JSON body.
- `"provider_failover"` added to `SSEEventType`.

**Frontend — useBrainSession.ts:**
- `SessionState.failoverProvider: string | null` — null until failover occurs.
- `PROVIDER_FAILOVER` action + reducer case sets it.
- `handleSSEEvent` handles `"provider_failover"` by dispatching `PROVIDER_FAILOVER`.
- `run()` spreads `{ failoverProvider: state.failoverProvider }` into `BrainRunRequest` when non-null.
