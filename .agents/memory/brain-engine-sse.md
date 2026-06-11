---
name: Brain engine SSE pattern
description: How the multi-role AI brain engine streams via SSE in the api-server
---

The brain engine (`artifacts/api-server/src/lib/brainEngine.ts`) calls gpt-5.4 sequentially for each AI role and streams events via Server-Sent Events to the frontend.

**SSE event types emitted (in order):**
1. `start` — session created, estimated credits
2. `role_start` — a role begins (role name, round, roleIndex)
3. `content` — streaming token chunks from that role
4. `role_end` — role finished (full content)
5. `round_start` / `round_end` — round markers
6. `confidence_update` — confidence % and credits used so far
7. `done` — session complete (finalAnswer, debateNotes, transcript, caveats, sessionId)
8. `error` — something went wrong

**Role sets by courtMode:**
- `adversarial`: Advocate, Skeptic, Devil's Advocate, Empiricist
- `socratic`: Questioner, Defender, Synthesizer, Logician
- `analysis`: Analyst, Contrarian, Realist, Futurist
- `critique`: Critic, Defender, Balanced Reviewer, Standards Expert

**OpenAI config:** gpt-5.4, use `max_completion_tokens` (not `max_tokens`). No `temperature` param (always 1 for gpt-5.x).

**Why sequential not parallel:** Each role needs to read the previous roles' output to argue against them. Parallelism would break the debate flow.

**How to apply:** The frontend hook `useBrainSession` in `artifacts/gh-brain/src/hooks/useBrainSession.ts` uses `runBrainSession()` from `sessionService.ts` which parses these SSE events and updates a reducer.
