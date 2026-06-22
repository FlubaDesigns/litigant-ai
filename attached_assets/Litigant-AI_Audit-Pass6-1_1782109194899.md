# Litigant AI — Audit Handoff, Pass 6 of N
**Scope of this pass:** `artifacts/api-server/src/routes/sessions.ts`, `report.ts`, `templates.ts`, `providers.ts`, `health.ts`, plus full end-to-end reads of `webhook.ts` and `brain.ts` (both only partially read in earlier passes — Pass 1 covered `brain.ts`'s credit-reservation logic specifically, and the Pass 3 addendum exchange checked `webhook.ts`'s one relevant call site, but neither file had been read in full until now). This closes out `routes/` entirely.

**Revision:** Two findings added on review — #18 (public reports always show "99" for round count — same root cause as #16, a second symptom of it) and #19 (`GET /sessions/:id` returns the full raw session document for any shared session, with no allowlist). Both confirmed directly: #18 by checking every `round` value `brainEngine.ts` actually writes, #19 by comparing the real session-document shape (pulled from where `brain.ts` creates it) against `report.ts`'s allowlist — which surfaced that `userId` is exposed today through this gap, not just a hypothetical future field.

**Status:** All backend route files are now read at least once. Remaining: the entire frontend (`gh-brain/src`), which has only been touched via a handful of targeted line-checks tied to specific findings (Pass 4's litigant-count mismatch, Pass 5's feature-flag consumption, this pass's `ShareReport.tsx`/`providerService.ts` checks) — no systematic pass yet.

---

## If fixing rather than just reading: suggested order for this pass's four findings
**#19 first** — it's the only one with a concrete, currently-exposed field (`userId`), not just a display-accuracy problem. **#18 second** — same fix shape as #16, batch them together since they share the same missing canonical role list. **#16 third** — same reasoning. **#17 last** — lowest visible impact; it's an admin-experience gap (a provider silently not showing up to configure further), not anything public-facing.

---

## Finding #16 — Publicly shared reports display a litigant count inflated by exactly 3, every time

**Severity: Medium. Confirmed, precisely quantified, and publicly visible to anyone with a share link — not a security issue, a visible correctness bug.**

### Where
`artifacts/api-server/src/routes/report.ts`, `GET /report/:shareId`, combined with the real role names `brainEngine.ts` writes to `session_turns` and `artifacts/gh-brain/src/pages/ShareReport.tsx`'s rendering of the result.

### What's broken
`report.ts` derives a `litigantCount` metric from the session's turn history rather than trusting the stored config (a reasonable design choice on its own — deriving from ground truth is generally safer than trusting a number that might not match what ran):
```ts
const litigants = new Set(
  turns
    .filter((t: any) => t["role"] !== "Orchestrator" && t["role"] !== "Verdict" && t["role"] !== "Moderator")
    .map((t: any) => t["role"])
).size;
result["litigantCount"] = litigants;
```
This filter excludes exactly three role names: `Orchestrator`, `Verdict`, `Moderator`. But I confirmed against `brainEngine.ts`'s actual `turns.push(...)` calls that the real pipeline writes turns under **six** non-litigant role names, not three:
```
Orchestrator   (role_start at line 292, turns.push at 314)
Moderator      (turns.push at 432)
Architect      (turns.push at 461)
Builder        (turns.push at 486)
Auditor        (turns.push at 511)
Verdict        (turns.push at 548)
```
`Architect`, `Builder`, and `Auditor` are not in the exclusion list. Every session writes exactly one turn under each of those three role names (Pass 1 confirmed these are single-pass, non-looping production stages — one Moderator turn, one Architect turn, one Builder turn, one Auditor turn per session, regardless of litigant count or rounds). All three slip through this filter and get counted as if they were litigants.

### The exact, predictable consequence
For a real session with 3 actual litigants (say, Advocate/Skeptic/Devil's Advocate in adversarial mode), the `litigants` Set ends up containing 6 distinct role names: the 3 real litigants plus Architect, Builder, and Auditor. **The displayed count is inflated by exactly 3, on every single session, regardless of configuration.** This isn't probabilistic or conditional — Architect/Builder/Auditor turns are written unconditionally by the pipeline every time, so the +3 error is constant.

I confirmed this is genuinely rendered to the public, not just computed and discarded: `ShareReport.tsx` reads `report.litigantCount` directly and displays it as `"{report.litigantCount} litigant{s}"` to anyone who opens a shared report link, no authentication required. A viewer reading the actual debate transcript on the same page — which correctly shows only the real litigant turns — could count the real participants themselves and see the displayed number doesn't match what's right there on the page.

### What I'd want before fixing this
This is a clean, low-risk fix — the exclusion list just needs the three missing names:
```ts
const NON_LITIGANT_ROLES = new Set(["Orchestrator", "Moderator", "Architect", "Builder", "Auditor", "Verdict"]);
const litigants = new Set(
  turns
    .filter((t: any) => !NON_LITIGANT_ROLES.has(t["role"]))
    .map((t: any) => t["role"])
).size;
```
I haven't applied this yet only because I want to flag a related question rather than fix it in isolation: `sessions.ts`'s `GET /sessions/:id` reconstructs `transcript`/`debateNotes` from the same `session_turns` data using a *different*, narrower exclusion (`t["role"] !== "Orchestrator"` only, for transcript; `!== "Orchestrator" && !== "Verdict"` for debate notes) — neither of those two derivations actually needs a "is this a litigant" concept the way `report.ts`'s metric does, so they're not wrong, just structured differently. But it suggests this codebase doesn't have one canonical "what counts as a non-litigant role" list shared anywhere — `report.ts`'s incomplete one is the only place that actually needs to get this exactly right, since it's the only one computing a count rather than just filtering display content. Worth introducing one shared constant (in `brainEngine.ts`, where the role names are defined) rather than hardcoding this list a second time in `report.ts` alone — this codebase already has several findings (Pass 2's #5, Pass 3's #8) about exactly this pattern of duplicated/drifting constants.

---

## Finding #17 — The provider-discovery endpoint can't see providers configured only through the admin Firestore UI

**Severity: Low-medium. Functional gap with a clear, traceable mechanism — same root cause as Pass 3's Finding #8, a third symptom of it.**

### Where
`artifacts/api-server/src/routes/providers.ts`, `GET /providers`, which calls the **synchronous**, env-var-only `getConfiguredProviders()`:
```ts
export function getConfiguredProviders(): ProviderName[] {
  const configured: ProviderName[] = [];
  const hasOpenAI = !!process.env["OPENAI_API_KEY"] || (...);
  if (hasOpenAI)                       configured.push("openai");
  if (process.env["ANTHROPIC_API_KEY"]) configured.push("anthropic");
  if (process.env["XAI_API_KEY"])       configured.push("grok");
  if (process.env["GEMINI_API_KEY"])    configured.push("gemini");
  return configured;
}
```

### What's broken
This function — confirmed identical to what Pass 3 documented — checks only `process.env`, never Firestore. `GET /providers` is the endpoint `providerService.ts`'s `getProviders()` calls, and that function is in turn called from `Session.tsx` — the actual courtroom page a user sees, to populate model/provider selection. Meanwhile, the engine's real execution path (`brainEngine.ts` → `createProviderAsync` → `apiKeyStore.ts`'s `getApiKey`, both confirmed Firestore-aware in Pass 1 and Pass 2) has no trouble using a provider configured exclusively through the Admin → API Keys UI.

The result: if you configure, say, a custom OpenAI-compatible provider purely through Admin → API Keys rather than as a Replit env var, that provider is fully functional end-to-end — but it will never appear as a selectable option anywhere in the product, because the one endpoint responsible for telling the frontend what's available is checking the wrong source.

### Why this is the same root issue as Pass 3's Finding #8, not a new pattern
Pass 3 already documented that `providers/index.ts` has both a sync (`getConfiguredProviders`, env-only) and async (`getConfiguredProvidersAsync`, Firestore-aware) version of "what's configured," and that the *async* one is correctly used in the live engine path while the *sync* one exists only "for internal/test use" per its own comment. This route is a second, real consumer of the sync version that probably shouldn't be — the same underlying mismatch, just a third place it surfaces (after the internal default-model duplication and now this user-facing discovery gap).

### What I'd want before fixing this
The fix is mechanical: `GET /providers` should call `getConfiguredProvidersAsync()` instead, and the route handler needs to become `async` to support that (it's currently synchronous). I haven't made this change because I want to flag it alongside Finding #8 rather than patch the symptom here without also addressing why the sync version is being reached for in places it probably shouldn't be — worth deciding whether `getConfiguredProviders()` (sync) should be more clearly marked as test-only (e.g. renamed, or moved out of the file's public exports) so a future addition doesn't reach for it a fourth time.

---

## Finding #18 — Public reports always display "99" for round count, never the real number

**Severity: Medium. Confirmed, deterministic, public-facing on every session — missed in the original Pass 6 writeup, added here on review.**

### Where
`artifacts/api-server/src/routes/report.ts`:
```ts
const rounds = turns.reduce((max: number, t: any) => Math.max(max, t["round"] ?? 0), 0);
...
result["roundsCompleted"] = rounds;
```

### What's broken
This takes the maximum `round` value across every turn with no filtering at all. I checked every `turns.push(...)` call in `brainEngine.ts` for the exact `round` value each one carries: real litigant turns use the actual round number (1, 2, 3...), the Orchestrator-opening turn uses `round: 0`, and — this is the part Finding #16 had already surfaced for a different reason — `Moderator`, `Architect`, `Builder`, `Auditor`, and `Verdict` are all written with the literal sentinel value `round: 99`, deliberately, to distinguish them from real debate rounds. Every completed session writes all five of those turns unconditionally. `Math.max` will pick up that `99` every single time, regardless of how many real rounds actually ran.

This isn't an occasional or conditional bug — it's deterministic. A session configured for 2 rounds that actually completes 2 rounds will still show `roundsCompleted: 99` on its public report, every time, with no exception. Anyone viewing a shared report alongside the actual transcript (which correctly shows "Round 1," "Round 2" on the real litigant turns) would see the displayed stat contradict what's plainly visible just below it on the same page.

### What I'd want before fixing this
The fix needs to filter to genuine debate turns before taking the max — which is exactly the same role-exclusion problem Finding #16 already identified needing a canonical, shared list rather than a second hand-written one:
```ts
const rounds = turns
  .filter((t: any) => !NON_LITIGANT_ROLES.has(t["role"]))
  .reduce((max: number, t: any) => Math.max(max, t["round"] ?? 0), 0);
```
I haven't applied this separately from Finding #16's fix — they're the same underlying gap (this file not having a single correct definition of "which roles are actual litigants") producing two different visible symptoms in the same response. Worth fixing both with one shared constant in the same edit rather than two separate ad-hoc filters in this file.

---

## Finding #19 — `GET /sessions/:id` returns the entire raw session document to anyone for any session marked shared, bypassing the allowlist `report.ts` was built to enforce

**Severity: Medium — and I'd actually call this slightly more urgent than just a forward-looking design concern, since I traced a real field that's exposed today, not only a hypothetical future one.**

### Where
`artifacts/api-server/src/routes/sessions.ts`, `GET /sessions/:id`:
```ts
const data = doc.data()!;
if (!data["shared"] && data["userId"] !== uid) {
  res.status(403).json({ message: "Forbidden" }); return;
}
...
res.json({
  id: doc.id,
  ...data,
  transcript,
  debateNotes,
  createdAt: data["createdAt"]?.toDate?.()?.toISOString() ?? null,
  updatedAt: data["updatedAt"]?.toDate?.()?.toISOString() ?? null,
});
```

### What's broken
The authorization check is an **or**, not an **and**: it lets the request through if *either* the session is shared *or* the requester owns it. That's correct and intentional — a session owner should see their own full document, and a publicly-shared session should be viewable by anyone. The problem is the response is identical for both cases: the same `...data` spread, with no field-narrowing applied specifically to the anonymous/shared-viewer case. An owner viewing their own session and a stranger viewing it via the share flag get back the exact same fields.

This file is doing the same conceptual job as `report.ts`'s `GET /report/:shareId` — both serve a shared session to an unauthenticated viewer — but `report.ts` was built with a deliberate, explicit `publicFields` allowlist (confirmed correctly scoped in the original Pass 6 pass), while this route has none. Any new field ever added to the session document is public, through this path, the moment it's written, with nobody needing to remember to update anything.

### This isn't only a future risk — I traced an actual field exposed right now
I pulled the real session-document shape from where it's created, in `brain.ts`:
```ts
await sessionRef.set({
  sessionId: result.sessionId,
  userId: uid,
  title: ...,
  question, templateId, confidence, creditsUsed, status,
  finalAnswer, debateNotes, transcript, caveats, artifacts,
  conscienceVersion, shared: false, shareId: null,
  ...(rebuttalContext ? { isRebuttal: true, rebuttalRound: ..., rebuttalChallenge: ..., parentSessionId: ... } : {}),
  createdAt: ..., updatedAt: ...,
});
```
Comparing this against `report.ts`'s `publicFields` list (`sessionId`, `title`, `question`, `templateId`, `confidence`, `creditsUsed`, `status`, `finalAnswer`, `debateNotes`, `transcript`, `caveats`, `artifacts`, `shared`, `shareId`) shows exactly one field present in the real document but conspicuously absent from that allowlist: **`userId`** — a Firebase UID. Its absence from `report.ts`'s list reads as a deliberate choice, not an oversight; whoever built that allowlist included everything else in the document except this one field. `GET /sessions/:id` has no such filter, so right now, today, any session anyone has ever marked `shared: true` exposes its owner's UID to anyone who knows or finds the session ID — via this route specifically, bypassing the protection the *other* sharing endpoint was deliberately built to provide.

I checked whether the app's own frontend actually exercises this gap: `ShareReport.tsx`, the real public-viewing page, calls `report.ts`'s endpoint exclusively, never this one. So the app's own UI doesn't trigger this today. But the route itself doesn't care how it's reached — anyone hitting `GET /api-server/api/sessions/{id}` directly (curl, browser devtools, anything) for a shared session ID gets the unfiltered document regardless of what the frontend happens to call.

### What I'd want before fixing this
Apply the same explicit-allowlist pattern `report.ts` already uses, scoped to whichever branch is the shared/anonymous one rather than the owner one:
```ts
if (uid && data["userId"] === uid) {
  // owner viewing their own session — full document is appropriate
  res.json({ id: doc.id, ...data, transcript, debateNotes, ... });
} else {
  // shared/anonymous viewer — same allowlist discipline as report.ts
  const { userId, ...publicSafe } = data;
  res.json({ id: doc.id, ...publicSafe, transcript, debateNotes, ... });
}
```
or, more robustly, reuse `report.ts`'s actual `publicFields` list so both endpoints draw from one definition rather than two independently-maintained ones (avoiding yet another instance of the duplicated-constant pattern already flagged twice elsewhere in this audit). I haven't applied this yet — it's a real fix but I want to flag the field-list duplication question alongside it rather than just patch this one file in isolation, the same reasoning as Finding #18 just above.

---

## What I verified and found clean this pass

- **`sessions.ts`** — every mutating route (`PATCH`, `DELETE`, `POST .../share`) checks `doc.data()["userId"] !== decoded.uid` before allowing the change. `shareId` is explicitly excluded from the accepted PATCH body, with a comment explaining the spoofing concern — consistent with what Pass 4 already confirmed about this file's general care level. `GET /sessions/:id` correctly allows unauthenticated reads only when `shared === true`.
- **`sessions.ts`'s use of the global `crypto.randomUUID()` with no explicit import** — looked like a missing-import bug at first glance. Checked the actual Node version target (`.replit`'s `modules = ["nodejs-24"]`) — `crypto` has been a global since Node 19, so this is correct, just a minor style inconsistency against other files in this codebase that do import it explicitly. Not a defect.
- **`report.ts`'s public field allowlist** — explicit, no `userId` or other PII included; the litigant-count bug above is the only issue found in this file.
- **`templates.ts`** — fully public, read-only, graceful Firestore-unavailable fallback to a static list. No issues.
- **`health.ts`** — trivial, correctly typed via the shared `@workspace/api-zod` schema. No issues.
- **`webhook.ts`** — read in full for the first time this pass; matches exactly what was already verified piecemeal in the Pass 3 addendum exchange (signature check gates everything, `handleSquareEvent` errors are caught and logged as non-fatal rather than crashing the webhook response). No new findings.
- **`brain.ts`'s guest-session tracking** — the file's own header docstring says this is "tracked in-memory; resets on restart by design." Read the actual implementation: it's genuinely Firestore-backed (`guest_sessions` collection), with an in-memory `Set` used only as a fallback when Firestore is unreachable. The real system is more durable than the comment describes — this is the comment being stale in the safe direction (undersells what the code does), not a bug. Worth a one-line comment update for accuracy, not a functional fix.
- **`brain.ts`'s `getClientIp`** — takes the first value from `x-forwarded-for`, which is the conventional approach to extracting a client IP behind a proxy. Couldn't fully verify whether Replit's actual autoscale infrastructure sanitizes this header before it reaches the app (that's infrastructure I can't inspect from this sandbox), so noting this as a low-confidence, low-stakes item rather than a real finding — the worst case if it is spoofable is bypassing the one-free-guest-session-per-IP limit, not anything touching paid accounts or data.

---

## Where to pick this up next
All route files have now been read at least once across Passes 1–6. The natural next step is the frontend — `gh-brain/src` in full. Given its size, I'd suggest splitting it the same way the backend was split: auth pages and Settings first (account security, mirroring Pass 4's priority), then the core Session/History/Billing pages, then Admin's frontend half, then the remaining smaller pages and shared components.
