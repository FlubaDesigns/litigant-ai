# Litigant AI — Audit Handoff, Pass 3 of N
**Scope of this pass:** `artifacts/api-server/src/lib/providers/` (all six files: `types.ts`, `anthropic.ts`, `openai.ts`, `grok.ts`, `gemini.ts`, `custom.ts`, `index.ts`), `squareClient.ts`, `squareEventHandler.ts`. This closes out the rest of `lib/` — Pass 1 + Pass 2 + this pass means every file in `artifacts/api-server/src/lib/` has now been read.

**Status:** Not yet read: every route file (`account.ts`, `admin.ts`, `auth.ts`, `billing.ts`, `brain.ts` already partially covered via Pass 1, `health.ts`, `providers.ts`, `report.ts`, `sessions.ts`, `templates.ts`, `webhook.ts`), and the entire frontend.

---

## Finding #7 — Aborting a session doesn't cancel an in-flight Anthropic request (but does for the other three providers)

**Severity: Medium. Real, isolated cost-control gap — not a security issue, a billing-efficiency one.**

### Where
`artifacts/api-server/src/lib/providers/anthropic.ts`, the `streamChat()` method, compared against the equivalent method in `openai.ts`, `grok.ts`, `gemini.ts`, and `custom.ts`.

### What's broken
Every provider's `streamChat()` accepts an optional `signal?: AbortSignal`. Four of the five forward it directly into their underlying SDK call:
```ts
// openai.ts, grok.ts, gemini.ts, custom.ts — all do this
const stream = await this.client.chat.completions.create(
  { model: this.model, max_tokens: maxTokens, stream: true, ...},
  { signal }   // ← forwarded to the SDK, cancels the actual HTTP request
);
```
`anthropic.ts` does not:
```ts
const stream = this.client.messages.stream({
  model: this.model,
  max_tokens: maxTokens,
  system: systemMsg,
  messages: conversation,
});
// no { signal } passed anywhere in this call

for await (const event of stream) {
  if (signal?.aborted) break;   // ← only stops the LOCAL loop from yielding more text
  ...
}
```
The `signal?.aborted` check inside the loop does correctly stop the function from streaming more text back to the user, but it only takes effect when the next chunk arrives from Anthropic — it doesn't call anything (e.g. `stream.abort()`, a method the Anthropic SDK's stream helper exposes) to actually cancel the upstream HTTP request. The underlying generation keeps running and being billed by Anthropic until it produces another token (letting the `break` fire) or finishes naturally on its own.

### Why this fires often enough to matter
This isn't a rare edge case. `routes/brain.ts` wires the abort signal to the most common real-world disconnect event there is:
```ts
const abortCtrl = new AbortController();
req.on("close", () => abortCtrl.abort());
```
Any time a user closes the tab, navigates away, or loses connection mid-session — ordinary behavior for a multi-minute, 8-call streaming session — this fires. For OpenAI/Grok/Gemini/Custom sessions, that genuinely cancels whatever request is in flight. For an Anthropic session, whichever seat is mid-generation when the user disconnects keeps running on Anthropic's end, consuming and billing tokens nobody will ever see.

### What I could and couldn't verify
I don't have the Anthropic SDK source available in this sandbox and no network access to check its current documentation, so I can't say with certainty whether `client.messages.stream()` even accepts a signal as a call option the way the OpenAI SDK does, or whether it only exposes cancellation via the returned stream object's own `.abort()` method. Either way, the practical conclusion is the same and I can verify *that* part directly from the code: nothing in this file calls anything to cancel the upstream request — no `signal` passed to `.stream()`, no `.abort()` call anywhere in the file. So regardless of which API the fix needs to use, the current code doesn't use either one.

### What I'd want before fixing this
If the Anthropic SDK's stream helper exposes `.abort()` (which I believe it does, based on the general pattern Anthropic's SDK follows, though I can't confirm from this sandbox), the fix is a small, contained change: capture the return value of `.stream()` and call `.abort()` on it inside the existing `if (signal?.aborted) break;` check, or register an `abort` event listener on `signal` at the top of the function that calls it immediately rather than waiting for the next chunk. I haven't made this change because I want to either confirm the SDK's exact cancellation API first, or have you confirm it from your own Anthropic SDK version's type definitions, rather than guess at a method name that might not exist in the version you're running.

---

## Finding #8 — A second hardcoded "default model per provider" map exists, separate from the one in `types.ts`, in the function path actually used in production

**Severity: Low. Same drift-risk pattern as Pass 2's Finding #5, in a different file.**

### Where
`artifacts/api-server/src/lib/providers/index.ts`, inside `createProviderAsync()`, compared against `DEFAULT_MODELS` exported from `types.ts`.

### What's broken
`types.ts` defines the canonical default-model map:
```ts
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-4o",
  anthropic: "claude-opus-4-5",
  grok: "grok-3",
  gemini: "gemini-2.5-pro",
};
```
`index.ts`'s synchronous `createProvider()` correctly imports and uses it. But `createProviderAsync()` — a separate function in the same file — redeclares the identical mapping as a local literal instead of reusing the import:
```ts
export async function createProviderAsync(id: string, model?: string, labelHint?: string): Promise<AIProvider> {
  ...
  const knownDefaults: Record<string, string> = {
    openai:    "gpt-4o",
    anthropic: "claude-opus-4-5",
    grok:      "grok-3",
    gemini:    "gemini-2.5-pro",
  };
  const resolvedModel = model ?? knownDefaults[id] ?? "gpt-4o";
  ...
}
```
Both maps currently hold identical values — I diffed them directly rather than eyeball it. The problem is what happens the next time they don't: I confirmed via `grep` that `brainEngine.ts` exclusively calls `createProviderAsync` (4 call sites, all of them) and never calls the synchronous `createProvider` at all — that function only exists, per its own comment, "for internal/test use." So **the function with the correct, single-source-of-truth default is the one that's not used in production, and the one that's actually used has its own separate, redundant, driftable copy.**

### Why this matters
If a model's default is ever changed in `types.ts` — for example, bumping the default Anthropic model when a new flagship ships — `createProviderAsync` (the live path) would silently keep using the old default unless someone remembers this second copy exists and updates it too. This is the same class of issue as Pass 2's Finding #5 (the admin pricing table's stale session constants) — a value that should have exactly one home ending up hardcoded in two places that have no mechanism keeping them in sync.

### What I'd want before fixing this
This one's unambiguous and low-risk: delete `knownDefaults` from `createProviderAsync` and have it reference the imported `DEFAULT_MODELS` instead, same pattern `createProvider` already uses correctly two functions above it in the same file. I haven't made the edit yet only because I want to batch it with Pass 2's Finding #5 if you'd rather review "fix the duplicated-constant pattern" as one unit across both occurrences, rather than as two separate small diffs landing at different times. Your call on sequencing; the fix itself isn't in question.

---

## What I verified and found clean this pass

- **`providers/types.ts`'s `PROVIDER_MODELS` vs. `creditEngine.ts`'s `MODEL_RATES`** — cross-checked programmatically (not by eye): every model offered to users has a real pricing entry, and there's no priced model that isn't actually offered. Zero drift in either direction.
- **`grok.ts`, `gemini.ts`, `custom.ts`** — all three correctly forward `{ signal }` into their OpenAI-SDK-based calls (they're built on the same client class, since both x.ai and Google's Gemini endpoint speak the OpenAI-compatible wire format), so the abort gap in Finding #7 is genuinely isolated to `anthropic.ts` alone, not a systemic provider-layer problem.
- **`openai.ts`'s use of `max_completion_tokens` vs. the other four providers' `max_tokens`** — looked suspicious at first glance (same SDK class, different parameter name), but checked it specifically: this lines up with OpenAI's own current API expecting the newer parameter name for its own models, while x.ai/Gemini's OpenAI-*compatible* endpoints haven't adopted that particular rename and still expect the older one. Anthropic's own native parameter is genuinely `max_tokens` too, unrelated to this. Looks like a deliberate, correct accommodation per-endpoint rather than an inconsistency — flagging that I can't fully confirm this against a live API call from this sandbox, but the pattern is consistent with how OpenAI's parameter deprecation actually rolled out.
- **`squareEventHandler.ts`** — fail-closed webhook signature verification with no bypass mode, correctly guards `timingSafeEqual`'s length-mismatch throw before calling it, defense-in-depth cap on credit grant size, and correctly idempotent via `addCredits()`'s own idempotency-key mechanism (confirmed it uses the canonical ledger function from Pass 2, not a hand-rolled transaction). Nothing to flag here — this file already reflects the kind of hardening I'd otherwise be recommending.
- **`squareClient.ts`** — sandbox/production URL switching, idempotency key support on payment link creation, Square API errors surfaced with their actual detail message rather than swallowed. The one thing I didn't check — whether `billing.ts` computes `amountCents` and the payment note server-side rather than trusting client input — is a routes-file question, deliberately deferred to the next pass rather than reaching past this pass's `lib/`-only boundary.

---

## Where to pick this up next
`lib/` is now fully read across Passes 1-3. Next: the route files. Given the size of `routes/`, I'd suggest splitting it across at least two passes — auth/account/billing first (money and identity, highest stakes, and where `squareClient.ts`'s `amountCents`/note construction from Finding context above should get checked), then sessions/admin/report/templates/health/providers after. After routes: the entire frontend, which is also where Pass 2's Finding #6 follow-up question (does `displayName` render unescaped anywhere else) finally gets resolved.
