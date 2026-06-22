# Litigant AI — Audit Handoff, Pass 2 of N
**Scope of this pass:** `artifacts/api-server/src/lib/creditLedger.ts`, `pricingConfig.ts`, `apiKeyStore.ts`, `conscienceConfig.ts`, `emailService.ts`, `logger.ts`. Continuing from Pass 1 (and its addendum) — nothing here contradicts those findings; one of them (Finding #2, the stale session-cost estimate) turns out to have a second, separate occurrence in this pass's scope.

**Status:** In progress. Not yet read: the four provider files (`providers/anthropic.ts`, `openai.ts`, `grok.ts`, `gemini.ts`, `providers/index.ts`, `providers/types.ts`), `squareClient.ts`, `squareEventHandler.ts`, every route file, and the entire frontend.

**Revision:** Finding #6 (unescaped `displayName` in transactional emails) is now fixed — see that section for the diff and verification. It was originally held back pending a broader frontend check; on review, that deferral didn't hold up, since the email fix doesn't depend on anything the frontend pass would find. Fixed now; the broader "does this render unescaped elsewhere" question is still open and still queued for later.

---

## Finding #5 — The admin pricing table has the same stale-estimate problem as Pass 1's Finding #2, in a second location

**Severity: Medium. Not a money leak — a visibility/trust problem for whoever relies on the admin dashboard to understand real costs.**

### Where
`artifacts/api-server/src/lib/pricingConfig.ts`, `getAdminPricingTable()`, lines ~140-145.

### What's broken
This function's own docstring states its assumption plainly:
> "The 'example' columns use a representative default session: 3 litigants, 2 rounds, balanced response mode → ~13 000 input tokens, ~5 600 output tokens."

```ts
const EXAMPLE_INPUT  = 13_000;
const EXAMPLE_OUTPUT = 5_600;
```
This is the exact same session-shape assumption Pass 1's Finding #2 identified as stale in `creditEngine.ts`'s `estimateSessionCredits()` — sized for the old 3-stage engine (orchestrator + litigants + verdict), not the current 8-call pipeline (orchestrator + litigants + Moderator + Architect + Builder + Auditor + verdict). This isn't the same bug recurring by coincidence — `13,000`/`5,600` are suspiciously close to what `estimateSessionCredits()` would produce for that same session shape, which suggests these two functions' "representative session" numbers were either copied from one another or derived from the same now-outdated source at the same point in the project's history. Either way, they're both wrong for the same reason and need the same fix.

### How much this actually shows you
I recomputed the table's example output for GPT-4o using its own stated constants, and compared it against Pass 1's already-calculated "real" cost for that identical session shape (3 litigants, 2 rounds, balanced, GPT-4o — same numbers Pass 1 used):
- **Admin pricing table shows:** 45 credits
- **Real session cost** (per Pass 1's Finding #2 calculation): ~83 credits
- **The admin table understates real cost by about 46%.**

### Why this is a distinct finding from Pass 1's #2, not a duplicate
Finding #2 (Pass 1) is about the number used to **gate whether a session can start** — fixing only that would make credit reservations accurate. This finding is about a **separate, admin-facing display function** that an admin would look at on the Admin → Pricing screen to sanity-check "what does a typical session actually cost me / cost the user." If you fix `estimateSessionCredits()` alone, this table keeps showing the old, wrong number, and anyone using it to reason about margins or to explain pricing to you would still be working from a number that's roughly half of reality.

### What I'd want before fixing this
Same situation as Finding #2: the fix is mechanical (update `EXAMPLE_INPUT`/`EXAMPLE_OUTPUT` to reflect the full 8-call pipeline with the same fill-rate methodology), but it shouldn't be fixed as two independent edits. The right structure is one canonical session-estimate function that both `estimateSessionCredits()` and `getAdminPricingTable()` call into, rather than two separately hardcoded copies of the same assumption — that's the only way this doesn't drift apart again the next time the engine's pipeline changes (which it already has once, silently, without either constant being updated). I haven't touched either yet, consistent with Pass 1's approach of flagging the calculation gap and waiting for your fill-rate input before writing the correction — once you confirm that, both functions should be fixed together, not one now and one later.

---

## Finding #6 — User-supplied display name is interpolated unescaped into transactional email HTML

**Severity: Medium. Confirmed real injection point. FIXED this pass — see below.**

**Revision note:** I originally held this fix back, reasoning I'd rather fix it once after checking whether `displayName` is unescaped elsewhere in the frontend too. That reasoning doesn't hold up — escaping inside `emailService.ts` is fully self-contained; it doesn't touch how `displayName` is stored or validated, so it can't conflict with or need to be redone after whatever the frontend pass finds. There was no real reason to wait, so I didn't. The broader question (does the same value render unescaped anywhere else, like a profile page or admin user list) is still open and still needs the frontend pass — fixing this one confirmed location doesn't close that question, it just stops being a reason to leave this specific file vulnerable in the meantime.

### Where
`artifacts/api-server/src/lib/emailService.ts`, `verificationTemplate()` and `passwordResetTemplate()`, combined with `artifacts/gh-brain/src/pages/auth/Register.tsx`'s signup form and `artifacts/api-server/src/routes/auth.ts` line 68.

### What was broken
The signup form's `displayName` field has no content restriction beyond a 2-character minimum:
```ts
// Register.tsx
displayName: z.string().min(2, "Name is required"),
```
That raw string is sent to Firebase Auth via `updateProfile(credential.user, { displayName })` with zero sanitization on the client, and zero sanitization anywhere on the backend — `auth.ts` line 68 just copies `decoded.name` (which is exactly what the client set) into the Firestore user document, no escaping. `emailService.ts` then read `user.displayName` straight from Firebase Auth and dropped it directly into raw HTML template strings with no escaping at all.

### Why this was real but narrower than it could be
I traced the actual delivery path: `sendVerificationEmail(uid)` and `sendPasswordResetEmail(email)` both send to the account's **own registered email address** — there's no path in this file where User A's display name ends up in an email sent to User B. So this wasn't a way to attack other people directly through this specific code path; the realistic exposure was self-XSS (a malicious browser extension or a webmail client with weak HTML sandboxing executing something in an email you sent yourself) — real, but a narrower attack surface than a cross-user injection would be. That narrower exposure is why I initially called this medium severity rather than high — that calibration hasn't changed, only the timing of the fix.

### The fix
Added an `escapeHtml()` helper and applied it at both call sites where `displayName` enters a template:
```ts
/**
 * Escapes the five HTML-significant characters before interpolating
 * user-controlled text into a raw HTML email template.
 *
 * displayName has no content restriction beyond a 2-character minimum
 * (see Register.tsx) and is never sanitized before reaching here — without
 * this, a display name like "<img src=x onerror=...>" would be inserted
 * verbatim into the email HTML this function builds.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function verificationTemplate(link: string, displayName?: string): string {
  const name = escapeHtml(displayName ?? "Operator");
  // ...
}

function passwordResetTemplate(link: string, displayName?: string): string {
  const name = escapeHtml(displayName ?? "Operator");
  // ...
}
```
I deliberately left `${link}` interpolations in both templates untouched — that value comes from `getAuth().generateEmailVerificationLink(...)` / `generatePasswordResetLink(...)`, a URL Firebase constructs itself from a signed token. The user has no input into its contents, so it's not the same trust boundary as `displayName` and doesn't need the same treatment.

### How I verified the fix
Ran the exact escape function (copy-pasted from the file, not a simplified stand-in) against an attack-shaped payload and two normal names:
```
$ node -e '
function escapeHtml(value) {
  return value.replace(/[&<>"\x27]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\x27": "&#39;" }[c])
  );
}
console.log(escapeHtml("<img src=x onerror=alert(document.cookie)>"));
console.log(escapeHtml("Dave OBrien"));
console.log(escapeHtml("Smith & Associates"));
'
&lt;img src=x onerror=alert(document.cookie)&gt;
Dave OBrien
Smith &amp; Associates
```
The attack payload's angle brackets are neutralized so the tag can never form; ordinary names with no special characters pass through completely unchanged; a name with a literal ampersand is escaped without affecting readability. Also re-checked brace/paren/bracket balance on the full file after the edit — clean, no syntax issue introduced.

### Still open — not closed by this fix
Whether `displayName` is rendered unescaped anywhere else in the app (profile pages, an admin user-list table, shared report bylines) is still unchecked. If any of those use `dangerouslySetInnerHTML` or similar instead of plain JSX text content (which React escapes by default), that's a stored-XSS exposure visible to other users or admins — a meaningfully higher severity than this email-only finding. That's frontend work, still queued for a later pass.

---

## What I verified and found clean this pass

- **`creditLedger.ts`'s `addCredits()`** — the canonical, documented "only function allowed to mutate creditBalance." Atomic transaction (idempotency check + balance read + balance write + ledger write, all in one Firestore transaction), correct idempotency-skip behavior for Square webhook deduplication, graceful no-op when Firebase isn't configured rather than throwing.
- **The "why does `brain.ts` have its own local `reserveCredits`/`reconcileCredits` instead of calling `addCredits()`" question** — resolved. `creditLedger.ts`'s own top-of-file docstring explicitly documents this as a deliberate performance exception ("avoiding a function call per stream chunk"), not an oversight. The duplication is intentional and disclosed in the code itself.
- **`pricingConfig.ts`'s live-multiplier override system** (`getEffectiveMultiplier`, `getMultiplierOverrides`, the 60-second cache with explicit invalidation on admin writes) — sound. Verified the admin route (`PUT /admin/pricing/:model` in `admin.ts`) genuinely enforces the `1-100` range the docstring promises, rather than just commenting that it should — checked the actual validation code, not just the comment.
- **`apiKeyStore.ts`'s nested-merge behavior in `saveApiKey()`** — checked this specifically because getting it wrong would mean every new API key save silently wipes out previously-saved keys. Firestore's documented `set(data, {merge: true})` semantics perform a deep merge on nested map fields, so this is safe — confirmed against platform documentation, not by live execution (no live Firestore available in this sandbox).
- **`apiKeyStore.ts`'s `deleteApiKey()`** — uses a different (non-merge) strategy than `saveApiKey()`, but it's internally consistent: it explicitly reconstructs the full document shape (`providers` + `updatedAt`, the only two fields this document ever has) rather than relying on merge semantics, so it doesn't accidentally drop anything.
- **`conscienceConfig.ts`** — same sound pattern as Pass 1's `seatBriefs.ts` finding (hardcoded fallback, Firestore override, TTL cache, explicit invalidation hook). No issues.
- **`logger.ts`** — explicitly redacts `Authorization` and `Cookie` headers from all log output. Good security practice, worth noting positively rather than just absence-of-bugs.
- **`checkAndTriggerAutoRefill`'s call-site sequencing in `brain.ts`** — verified it reads the user's balance fresh from Firestore *after* the overage charge attempt (Pass 1 Finding #3) has already run, not before. So even though that overage charge can silently fail, the auto-refill threshold check downstream isn't working off a stale number — it's a separately-correct piece of sequencing, not a compounding bug.

---

## Where to pick this up next
Not yet read: all four provider files (`anthropic.ts`, `openai.ts`, `grok.ts`, `gemini.ts`), `providers/index.ts`, `providers/types.ts`, `squareClient.ts`, `squareEventHandler.ts` — that's the rest of `lib/`. After that: every route file, then the entire frontend, where Finding #6's "where else does `displayName` get rendered unescaped" question should get resolved.
