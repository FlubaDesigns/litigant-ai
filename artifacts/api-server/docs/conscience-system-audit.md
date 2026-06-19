# Conscience System — Full Audit
**Litigant AI · Canon v2 · June 2026**

---

## What this system does

Every AI session in Litigant AI is governed by a **conscience clause** — a block of plain-English instructions injected into the system prompt of every AI role before it speaks. The clause is not a filter that removes content after the fact. It is a pre-instruction that changes how the AI reasons before it produces output. The difference matters: a filter is a guard rail; a conscience clause is a character constraint.

The Canon v2 clause forces five specific behaviours:

1. **Truth First** — the AI must lead with the honest conclusion even when it is uncomfortable.
2. **Verify Before Asserting** — explicit uncertainty ("I don't know") is required when the AI cannot substantiate a claim.
3. **No Diplomatic Evasion** — giving a balanced non-answer to avoid conflict is a violation, not a virtue.
4. **Expose Gaps** — the AI must surface what information is missing that would materially change the conclusion.
5. **Execution-Honest** — if the AI's reasoning led somewhere unexpected, it must report that rather than reverse-engineering a tidy argument.

This document traces every node the conscience clause passes through, from Firestore to the saved session record.

---

## Architecture overview

```
Firestore
  system_config/conscience
    ├── text: string        ← the live clause injected into prompts
    ├── version: string     ← e.g. "v2.0-canon"
    ├── updatedAt: Timestamp
    └── updatedBy: string   ← admin uid

         │
         │  read once per 5-min TTL window
         ▼

conscienceConfig.ts
  getConscienceClause()    ← async, returns { text, version }
  invalidateConscienceCache()
  CANON_V2_FALLBACK_TEXT   ← hardcoded Canon v2 (used when Firestore unavailable)
  CANON_V2_FALLBACK_VERSION = "v2.0-canon"

         │
         │  called once at session start
         ▼

brainEngine.ts  runBrainSession()
  conscienceClause  →  appended to Orchestrator system prompt
  conscienceClause  →  appended to each Litigant system prompt (every round)
  conscienceClause  →  appended to Verdict (Synthesizer) system prompt
  conscienceVersion →  included in BrainRunResult + SSE "done" event

         │
         │  result returned to brain.ts
         ▼

brain.ts  POST /run-brain
  session document written to Firestore:
    conscienceVersion: result.conscienceVersion

         │
         │  admin only
         ▼

admin.ts
  GET  /admin/conscience   ← read current clause from Firestore
  PATCH /admin/conscience  ← write new clause + invalidate cache
```

---

## Node 1 — Firestore document: `system_config/conscience`

**File:** Firestore (seeded by `scripts/seed-conscience.mjs`)

**Schema:**
```
{
  text:       string     — full conscience clause text (injected verbatim into prompts)
  version:    string     — human-readable version label, e.g. "v2.0-canon"
  updatedAt:  Timestamp  — server timestamp of last write
  updatedBy:  string     — uid or "seed-script" for the initial seed
}
```

**What it controls:**
This is the single source of truth for the conscience clause. Changing this document changes what every new AI session reasons under. No code deploy is needed — a `PATCH /admin/conscience` call takes effect on new sessions within seconds on the instance that handled the request, and within 5 minutes on all other Cloud Run instances (TTL expiry).

**Current state:**
The document was seeded on 2026-06-19 with `version: "v2.0-canon"` and the full five-point Canon v2 mandate. It exists in the `system_config` collection which is reserved for server-side configuration that is never exposed directly to end users.

**What happens if the document is deleted:**
`conscienceConfig.ts` falls back to `CANON_V2_FALLBACK_TEXT` automatically. The system degrades gracefully — sessions continue running under Canon v2, the fallback version string `"v2.0-canon"` is stamped on saved records so the audit trail remains meaningful.

---

## Node 2 — `conscienceConfig.ts` (cache layer)

**File:** `artifacts/api-server/src/lib/conscienceConfig.ts`

**Purpose:**
Abstracts Firestore access behind a single async function. Prevents a Firestore read on every single AI session (which would add latency on every request and burn Firestore quota unnecessarily).

**Cache behaviour:**
- Module-level `_cache` variable — one per Cloud Run instance
- TTL: 5 minutes (`TTL_MS = 5 * 60 * 1000`)
- On cache miss: reads `system_config/conscience` from Firestore, stores result with a `fetchedAt` timestamp
- On Firestore error: logs a warning, returns fallback text **without** caching (so the next request retries rather than caching a failure state)
- On empty document field: falls back gracefully to Canon v2 text rather than injecting an empty string into prompts

**The toggle (conscience: false):**
When `config.conscience` is set to `false` in the session config (the user turned the toggle off in Mission Briefing), `brainEngine.ts` skips the `getConscienceClause()` call entirely and sets `version: "disabled"`. This means the Firestore read is not performed at all — not just that an empty string is returned. Saved sessions record `conscienceVersion: "disabled"` so it is auditable which sessions ran without the clause.

**`invalidateConscienceCache()`:**
Called by the `PATCH /admin/conscience` endpoint immediately after a successful Firestore write. Forces this instance to re-read from Firestore on the very next session rather than waiting for the TTL window to expire. Other instances still wait up to 5 minutes — this is an intentional architectural tradeoff. A Cloud Function approach could push invalidation to all instances simultaneously, but it introduces infrastructure complexity (the Function needs to call a private Cloud Run endpoint) for a use case that updates the conscience clause at most a handful of times per year.

**Exported symbols:**
- `getConscienceClause()` — the primary interface used by `brainEngine.ts`
- `invalidateConscienceCache()` — used by `admin.ts` after a PATCH write
- `CANON_V2_FALLBACK_TEXT` — exported so `admin.ts` can return it in `GET /admin/conscience` when no Firestore document exists
- `CANON_V2_FALLBACK_VERSION` — same reason

---

## Node 3 — `brainEngine.ts` (prompt injection)

**File:** `artifacts/api-server/src/lib/brainEngine.ts`

**Where conscience is loaded:**
```typescript
// Line ~220
const { text: conscienceText, version: conscienceVersion } =
  config.conscience !== false
    ? await getConscienceClause()
    : { text: "", version: "disabled" };
const conscienceClause = conscienceText;
```

This happens once per session, right after the `baseContext` is assembled, before any AI role is called. The version string is captured here and carried through to the final result. It does not change mid-session — if the Firestore document is updated while a session is in progress, that session continues under the version it loaded at start. This is correct behaviour: a session must be governed by a single consistent canon version from start to finish.

**Where it is injected — three prompt layers:**

### Layer 1: Orchestrator
```typescript
content: `You are the Orchestrator of a multi-AI reasoning courtroom. Frame the trial, identify
the core contested questions, and set expectations for the debate. Be concise (3-4 sentences max).
${conscienceClause}`
```
The Orchestrator sets the frame for the entire session. Injecting the clause here establishes the epistemic standard before any debate begins. The Orchestrator is instructed to be concise, so the clause is the most substantial instruction it receives.

### Layer 2: Each Litigant (every round)
```typescript
content: `${baseContext}\n\nYour role: ${role.persona}. ${role.instruction}\n\nBe sharp, specific,
and argumentative. Do not be vague.${conscienceClause}`
```
The clause is appended to every litigant's system prompt on every round. This is intentional: the AI model's context window is re-initialised each call, so without re-injection the clause would have no effect on rounds 2, 3, etc. The clause is appended after the role instruction rather than before it, so the role-specific personality (Advocate, Skeptic, etc.) is established first and the conscience mandate applies to it.

### Layer 3: Verdict (Synthesizer)
```typescript
content: `You are the Synthesizer — the final judge in a multi-AI courtroom. Deliver a
comprehensive, balanced verdict incorporating all perspectives. Be definitive where evidence
is clear, honest about uncertainty where it remains. Always produce all four sections.
${conscienceClause}`
```
The Verdict role is where diplomatic evasion is most tempting — it is the role most likely to produce a "both sides have merit" non-answer. Injecting the clause here specifically prevents that. Point 3 (No Diplomatic Evasion) and Point 5 (Execution-Honest) are most relevant to the Synthesizer.

**`BrainRunResult.conscienceVersion`:**
```typescript
export interface BrainRunResult {
  // ...
  conscienceVersion: string;  // "v2.0-canon" | "disabled" | any version string
  // ...
}
```
The version is a first-class field on the result type — not an afterthought or metadata. It travels with every result through the SSE `done` event to the frontend and to the Firestore session save.

**Paused sessions and `continueFromTranscript`:**
When a session is paused mid-debate (credit cap hit, iteration limit reached) and then resumed via `continueFromTranscript`, `getConscienceClause()` is called again at the start of the resumed session. This means:
- The resumed session loads whatever canon is current at the time of resumption
- If the canon was updated between pause and resume, the resumed session uses the new version
- The `conscienceVersion` on the resumed result reflects the version active during the *continuation*, not the original start

This is a known behaviour. In most cases it will be the same version. If strict version continuity across resume is required in a future iteration, the version should be passed in the resume request body alongside `continueFromTranscript`.

---

## Node 4 — `brain.ts` (session persistence)

**File:** `artifacts/api-server/src/routes/brain.ts`

**Where conscienceVersion is saved:**
```typescript
await sessionRef.set({
  sessionId: result.sessionId,
  userId: uid,
  // ...all other fields...
  conscienceVersion: result.conscienceVersion,   // ← audit field
  shared: false,
  shareId: null,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
```

Every session document in the `sessions` Firestore collection now has a `conscienceVersion` field. This makes it possible to:

- Query all sessions that ran under a specific canon version: `where("conscienceVersion", "==", "v2.0-canon")`
- Identify sessions that ran with conscience disabled: `where("conscienceVersion", "==", "disabled")`
- Reconstruct exactly what mandate governed any historical session
- Detect if a canon update had any measurable effect on session quality or user satisfaction

**Guest sessions:**
Guest sessions (no auth token, one free session per IP) run through `runBrainSession` and receive a `conscienceVersion` in the result, but are **not** saved to Firestore (the `if (db && uid)` block is skipped). The `conscienceVersion` is still sent in the SSE `done` event to the frontend, so it is visible in the client if needed. If guest session persistence is added to Firestore in the future, `conscienceVersion` is already on the result and just needs to be included in the write.

---

## Node 5 — `admin.ts` (management endpoints)

**File:** `artifacts/api-server/src/routes/admin.ts`

Both endpoints are protected by `requireAdmin` middleware, which verifies the Bearer token and checks for the `admin: true` custom claim. Requests without a valid admin token receive a 403 before reaching any handler.

### `GET /admin/conscience`

Returns the current active conscience clause. If no Firestore document exists, returns the Canon v2 fallback text with an explanatory note so the admin can see what is actually running rather than getting a 404.

**Response when seeded:**
```json
{
  "exists": true,
  "id": "conscience",
  "text": "\n\nCONSCIENCE MANDATE — EXECUTION-HONEST (Canon v2):\n...",
  "version": "v2.0-canon",
  "updatedAt": "2026-06-19T04:56:00.000Z",
  "updatedBy": "seed-script"
}
```

**Response when no document exists:**
```json
{
  "exists": false,
  "version": "v2.0-canon",
  "text": "\n\nCONSCIENCE MANDATE...",
  "updatedAt": null,
  "updatedBy": null,
  "note": "No Firestore document found — Canon v2 fallback is in use."
}
```

### `PATCH /admin/conscience`

**Body:**
```json
{
  "text": "...",      // required — the full new clause text
  "version": "v2.1"  // optional — defaults to "v-YYYY-MM-DD" if omitted
}
```

**What it does:**
1. Validates that `text` is present and non-empty
2. Writes to `system_config/conscience` with `updatedBy: req.adminUid` so every write is attributed
3. Calls `invalidateConscienceCache()` to force this instance to re-read immediately
4. Returns `{ success: true, version, note }` where the note reminds the admin that other Cloud Run instances update within 5 minutes

**What it does not do:**
It does not archive the previous version. If version history is needed in the future, the handler should write the previous document to a `system_config/conscience_history` subcollection before overwriting. That is a straightforward addition when required.

---

## Firestore security rules consideration

The `system_config` collection is written to only by the server-side Admin SDK, which bypasses Firestore security rules entirely. However, the collection should be locked in Firestore rules so that client-side SDK access (if any frontend code ever uses the Firebase client directly) cannot read or write it:

```
match /system_config/{document=**} {
  allow read, write: if false;
}
```

This is a recommended addition to your `firestore.rules` file. It has no effect on the API server (Admin SDK ignores rules) but closes a surface area if client credentials are ever compromised.

---

## End-to-end data flow summary

```
User starts session (conscience toggle ON)
  │
  ├─ brain.ts receives POST /run-brain
  │
  ├─ runBrainSession() called
  │    │
  │    ├─ getConscienceClause() called
  │    │    ├─ cache fresh? → return cached { text, version }
  │    │    └─ cache stale? → read Firestore system_config/conscience
  │    │         ├─ doc exists? → cache + return { text, version }
  │    │         └─ doc missing or error? → return Canon v2 fallback
  │    │
  │    ├─ conscienceClause appended to Orchestrator prompt → AI call
  │    ├─ conscienceClause appended to each Litigant prompt → AI calls (every round)
  │    ├─ conscienceClause appended to Verdict prompt → AI call
  │    │
  │    └─ return BrainRunResult { ..., conscienceVersion: "v2.0-canon" }
  │
  ├─ SSE "done" event sent to frontend (includes conscienceVersion)
  │
  └─ Firestore sessions/{id} written with conscienceVersion: "v2.0-canon"


Admin updates clause
  │
  ├─ PATCH /admin/conscience { text: "...", version: "v2.1" }
  │
  ├─ Firestore system_config/conscience overwritten
  ├─ invalidateConscienceCache() clears _cache on this instance
  │
  └─ Next session on this instance loads v2.1 immediately
     Other Cloud Run instances load v2.1 within 5 minutes (TTL)
```

---

## Gaps and recommendations

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | `continueFromTranscript` resume loads current canon, not original | Low | Pass `conscienceVersion` in resume request body; if it differs from current, log a warning |
| 2 | Guest sessions not saved to Firestore | Low | When guest persistence is added, include `conscienceVersion` in the write — it's already on the result |
| 3 | No version history on conscience updates | Low | Before overwriting, archive previous doc to `system_config/conscience_history/{timestamp}` |
| 4 | `system_config` not locked in Firestore rules | Medium | Add `allow read, write: if false` to `firestore.rules` for the `system_config` collection |
| 5 | Multi-instance cache invalidation is passive (TTL only) | Low | Acceptable for current usage — revisit if canon updates become frequent or time-critical |

---

## Verification checklist

- [x] `system_config/conscience` seeded in Firestore — version `v2.0-canon`, confirmed by `scripts/seed-conscience.mjs`
- [x] `conscienceConfig.ts` compiles with zero TypeScript errors
- [x] `getConscienceClause()` imported and called in `brainEngine.ts`
- [x] `conscienceClause` injected in all three prompt layers: Orchestrator, Litigant, Verdict
- [x] `conscienceVersion` field on `BrainRunResult` interface
- [x] `conscienceVersion` included in SSE `done` event
- [x] `conscienceVersion` written to Firestore session document in `brain.ts`
- [x] `GET /admin/conscience` returns current clause or fallback with `exists` flag
- [x] `PATCH /admin/conscience` writes to Firestore + invalidates local cache + attributes write to admin uid
- [x] Both admin endpoints protected by `requireAdmin` middleware
- [x] TypeScript: zero errors across all modified files
- [x] API server restarts and serves requests cleanly
