# Litigant AI — Fix Handoff (Rev. 1)
**Scope:** 6 confirmed issues from the production audit, fixed and verified against the actual source. Every fix below is shown as a real before/after diff from the uploaded codebase — nothing here is generic advice.

**For:** Rep (Replit) / Ghost — apply these directly.
**Files touched:** 6. **New files:** 0. **Breaking config requirement:** 1 (see Fix #3 — read before deploying).

---

## How to use this document

Each fix has:
1. **The problem** — what's broken, in plain terms.
2. **The evidence** — exact file + line, quoting the actual broken code.
3. **The fix** — full corrected file (small files) or precise patch (large files).
4. **Why this is correct** — the reasoning, plus what I verified vs. what still needs a runtime check on your end.

Apply them in this order — #1 and #2 are the urgent ones (real money/data exposure), #3–5 are correctness bugs, #6 is cosmetic.

---

## Fix #1 — Firestore rules let any user overwrite their own credit balance

### The problem
`firestore.rules` had this for the `users` collection:

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

This says: "if you're signed in as user X, you may write *anything* to `/users/X`." There is no field restriction. Your backend (`brain.ts`, `creditLedger.ts`) is the only place that's *supposed* to touch `creditBalance` — but this rule doesn't enforce that. Any signed-in user can open browser devtools, import the Firebase client SDK with the public config (which ships in your JS bundle — that's normal and fine), and run:

```js
updateDoc(doc(db, "users", myOwnUid), { creditBalance: 999999999 });
```

That succeeds today. It bypasses `reserveCredits`/`addCredits` entirely. This isn't theoretical — `firestoreService.ts` already calls `updateDoc(ref, data)` with no field allowlist (`updateUserProfile`), and the rule is the only thing standing between a user and their own balance field.

### The evidence
`firestore.rules` (full original file):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read and write their own profile document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Sessions: owner can read/write; shared sessions readable by anyone with the shareId
    match /sessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow read: if resource.data.isPublic == true;
    }

    // Admin-only collections
    match /admin/{document=**} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }

    // Deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Two more bugs bundled in here, found while fixing this:
- **`isPublic` is dead.** Nothing in the codebase ever sets `isPublic` — `brain.ts`, `sessions.ts`, and the frontend all use a field called `shared`. This clause has never matched a real document. Harmless today only because `ShareReport.tsx` fetches via your server endpoint (Admin SDK, bypasses rules) instead of reading Firestore directly.
- **`feedback` collection has no rule at all.** `feedbackService.ts` calls `addDoc(collection(db, "feedback"), ...)` directly from the browser. Since `feedback` isn't matched by `/users`, `/sessions`, or `/admin`, it falls through to the explicit `allow read, write: if false` at the bottom. **Every feedback submission in the live app is silently failing right now** — the try/catch in `submitFeedback()` swallows the error to `console.error` and rethrows, but nothing surfaces to the user, so this could run for a long time unnoticed.

### The fix — full corrected `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Server-only fields on the user document. These must never be writable
    // directly from the client SDK — they are mutated exclusively by the
    // backend (Admin SDK) via creditLedger.ts / admin.ts, which bypasses
    // these rules entirely. Listing them here blocks the client-SDK path.
    function touchesProtectedUserFields() {
      let protectedFields = [
        'creditBalance', 'plan', 'subscriptionStatus',
        'banned', 'bannedReason', 'bannedAt', 'bannedBy',
        'autoRefill', 'autoRefillCheckoutUrl', 'autoRefillTriggeredAt'
      ];
      return request.resource.data.diff(resource.data).affectedKeys().hasAny(protectedFields);
    }

    // Users can read their own profile. Writes are allowed only for
    // non-financial fields (displayName, defaultSettings, notifications, etc.) —
    // creditBalance and plan/ban state can only change via the Admin SDK.
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId
                    && !touchesProtectedUserFields();
      allow update: if request.auth != null && request.auth.uid == userId
                    && !touchesProtectedUserFields();
    }

    // Sessions: owner can read/write; shared sessions readable by anyone with
    // the shareId. Field name corrected to "shared" — the app never sets
    // "isPublic" (brain.ts / sessions.ts both write "shared"), so the old
    // clause never matched anything.
    match /sessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow read: if resource.data.shared == true;
    }

    // Feedback: any signed-in user (or guest, where userId is null) may
    // create a feedback entry; nobody can read, update, or delete via the
    // client SDK. submitFeedback() in feedbackService.ts relies on create
    // succeeding — without this block all feedback submissions silently fail.
    match /feedback/{feedbackId} {
      allow create: if request.resource.data.userId == null
                    || (request.auth != null && request.auth.uid == request.resource.data.userId);
      allow read, update, delete: if false;
    }

    // Admin-only collections (admin dashboard data surfaced under /admin/**,
    // if ever read via client SDK instead of the Admin SDK backend routes).
    match /admin/{document=**} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }

    // Everything else (config/*, credit_transactions/*, payment_events/*,
    // templates/*, system_config/*, guest_sessions/*, api_logs/*) is written
    // and read exclusively by the backend via the Firebase Admin SDK, which
    // bypasses these rules entirely. The client SDK should never touch them,
    // so they stay denied here as defense-in-depth.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Why this is correct
- `request.resource.data.diff(resource.data).affectedKeys().hasAny([...])` is Firestore's standard idiom for "does this write touch any of these specific fields" — it compares the incoming write against the existing document and lists exactly which fields changed. If a write changes `displayName` only, this is `false` and the write is allowed; if it also (or only) touches `creditBalance`, it's `true` and the write is rejected.
- I checked every place your own frontend code calls `updateUserProfile`/`createUserProfile` (`Settings.tsx` lines 102, 119, 138, 396, 524) — they only ever send `role`, `organization`, `displayName`, `email`, `defaultSettings`, `notifications`. None of those are in the protected list, so **none of your existing app functionality breaks.**
- `createUserProfile()` in `firestoreService.ts` is dead code (zero callers anywhere in the app) but its type includes `creditBalance` — if it's ever wired up later without realizing it shouldn't carry that field, this rule now catches it instead of silently allowing it.

### What I could not verify
I don't have the Firebase Emulator Suite available in this environment (no network access to install `firebase-tools`), so I could not run this through `firebase emulators:start --only firestore` with the Rules unit-test SDK. The syntax is correct standard Firestore Rules syntax and the logic is straightforward, but **please run your sandbox project against this before deploying to production**, or use `firebase deploy --only firestore:rules --project <sandbox>` and manually test: (a) a normal Settings save still works, (b) a hand-written `updateDoc` call setting `creditBalance` is rejected, (c) a feedback submission succeeds.

---

## Fix #2 — Square webhook accepts forged payment events if a config var is missing

### The problem
`squareEventHandler.ts` verifies the webhook signature Square sends — but only if `SQUARE_WEBHOOK_SIGNATURE_KEY` is set. If that env var is missing, the original code logged a warning and **let the request through anyway**:

```ts
export function verifySquareWebhook(
  rawBody: string,
  signature: string,
  notificationUrl: string
): boolean {
  const signingKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  if (!signingKey) {
    logger.warn(
      "[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — skipping verification (set it in production)"
    );
    return true;   // <-- accepts the request unverified
  }
  // ...
}
```

This endpoint grants credits (`handleSquareEvent` → `addCredits(...)`). The exact payment-note format that triggers a grant is documented right in your own code comments: `"LITIGANT:userId=<uid>,creditAmount=<n>,pack=<packId>"`. If this env var isn't set in your real production deployment — I can't tell from the code alone whether it is, that's a deployment fact, not a code fact — anyone can `curl` a fake `payment.updated` event with `status: "COMPLETED"` and a note containing any `userId` and any `creditAmount`, and your ledger will credit it for real, no actual payment required.

**I also found a second, unrelated bug while reading this function closely:** `crypto.timingSafeEqual()` throws an exception if the two buffers aren't the same length — it doesn't return `false`. I tested this directly:
```
node -e "crypto.timingSafeEqual(Buffer.from('abc'), Buffer.from('ab'))"
→ THREW: Input buffers must have the same byte length
```
The original code passed `Buffer.from(signature)` straight into `timingSafeEqual` with no length check. Any malformed or wrong-length signature header (not even malicious — just a bad request) would throw an uncaught exception inside your webhook route.

### The evidence
`artifacts/api-server/src/lib/squareEventHandler.ts` (original, both bugs visible):
```ts
export function verifySquareWebhook(
  rawBody: string,
  signature: string,
  notificationUrl: string
): boolean {
  const signingKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  if (!signingKey) {
    logger.warn(
      "[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — skipping verification (set it in production)"
    );
    return true;
  }

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

### The fix — full corrected file

```ts
import crypto from "crypto";
import { addCredits } from "./creditLedger.js";
import { isFirebaseConfigured } from "./firebaseAdmin.js";
import { logger } from "./logger.js";

/**
 * Verify a Square webhook signature.
 * Square computes: Base64( HMAC-SHA256( signingKey, notificationUrl + rawBody ) )
 * and sends it in the "x-square-hmacsha256-signature" header.
 *
 * If SQUARE_WEBHOOK_SIGNATURE_KEY is not set, the webhook is REJECTED.
 * Credits are minted from this endpoint (see handleSquareEvent below), so an
 * unverified webhook is an open door to free credits for anyone who can guess
 * the documented payment-note format. There is no safe "skip verification"
 * mode — sandbox testing should set a sandbox signing key from the Square
 * dashboard rather than disabling verification.
 */
export function verifySquareWebhook(
  rawBody: string,
  signature: string,
  notificationUrl: string
): boolean {
  const signingKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  if (!signingKey) {
    logger.error(
      "[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — rejecting webhook. " +
        "Set this env var (from the Square Developer Dashboard) before going live; " +
        "without it, credit-granting webhooks cannot be verified and must be refused."
    );
    return false;
  }

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");

  // Lengths must match before timingSafeEqual — it throws on mismatched buffer
  // lengths rather than returning false, which would otherwise crash this
  // request instead of cleanly rejecting it.
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

interface SquareWebhookEvent {
  merchant_id: string;
  type: string;
  event_id: string;
  data: { object: Record<string, any> };
}

/**
 * Handle a verified Square webhook event and apply credit grants.
 *
 * Metadata is encoded in the payment note as:
 *   "LITIGANT:userId=<uid>,creditAmount=<n>,pack=<packId>"
 *
 * The event_id is used as the idempotency key so exactly-once semantics
 * are preserved even if Square retries the webhook.
 */
export async function handleSquareEvent(event: SquareWebhookEvent): Promise<void> {
  if (!isFirebaseConfigured()) return;

  switch (event.type) {
    case "payment.updated": {
      const payment = event.data.object["payment"];
      if (!payment) return;
      // Only process when payment reaches COMPLETED status
      if (payment.status !== "COMPLETED") return;

      const note: string = payment.note ?? "";
      const match = note.match(/LITIGANT:userId=([^,]+),creditAmount=(\d+)/);
      if (!match) {
        logger.warn(
          "[SquareEvent] payment.completed: no LITIGANT metadata in payment note — ignoring"
        );
        return;
      }

      const userId = match[1];
      const creditAmount = parseInt(match[2], 10);
      if (!userId || !creditAmount) return;

      // Defense-in-depth: no legitimate credit pack or custom top-up (see
      // creditPacks.ts, max $500 → 50,000 credits) ever produces a value
      // this large. Catches a malformed/forged note even if signature
      // verification is ever misconfigured.
      const MAX_CREDIT_GRANT = 100_000;
      if (creditAmount > MAX_CREDIT_GRANT) {
        logger.error(
          `[SquareEvent] Rejected suspicious creditAmount=${creditAmount} for ${userId} — exceeds ${MAX_CREDIT_GRANT} cap`
        );
        return;
      }

      const result = await addCredits(userId, creditAmount, "purchase", {
        source: "square_checkout",
        paymentId: payment.id as string,
        idempotencyKey: event.event_id,
      });

      if (result?.skipped) {
        logger.info(`[SquareEvent] Event ${event.event_id} already processed — skipped`);
      } else {
        logger.info(`[SquareEvent] Granted ${creditAmount} credits to ${userId}`);
      }
      break;
    }

    default:
      logger.debug(`[SquareEvent] Unhandled event type: ${event.type}`);
      break;
  }
}
```

### ⚠️ Deployment requirement — read before deploying this fix
**If `SQUARE_WEBHOOK_SIGNATURE_KEY` is not currently set in your production environment, this fix will immediately start rejecting every Square webhook.** That means no purchased credits will be granted to anyone until you set it. This is the correct tradeoff — "broken but visible" beats "working but exploitable" — but it needs a deliberate action on your end:

1. Go to the Square Developer Dashboard → your application → Webhooks.
2. Copy the **Signature Key** for the webhook subscription pointed at `/api/square/webhook`.
3. Set it as `SQUARE_WEBHOOK_SIGNATURE_KEY` in your Replit/Cloud Run environment.
4. Then deploy this fix.

If you deploy the fix before setting the key, purchases will go through Square fine but credits won't land — you'll see `[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — rejecting webhook` in your logs as the signal.

### Why this is correct
- Fail-closed instead of fail-open is the only safe default for an endpoint that mints money-equivalent value with no other gate.
- The length check before `timingSafeEqual` is necessary specifically because that function throws (not returns `false`) on length mismatch — I confirmed this by running it directly rather than assuming.
- The `MAX_CREDIT_GRANT` cap is genuinely defense-in-depth, not the primary fix — it's there in case signature verification is ever misconfigured again in the future; it shouldn't be relied on as the only protection.

---

## Fix #3 — Credit ledger entries get stamped "pending" / "failed" instead of the real session ID

### The problem
In `brain.ts`, the reservation and failure-refund calls used:
```ts
const reserved = await reserveCredits(uid, estimatedCost, sessionId ?? "pending");
// ...
await reconcileCredits(uid, estimatedCost, sessionId ?? "failed", "brain_failure_refund");
```
`sessionId` here comes straight from the request body. I checked your frontend (`useBrainSession.ts` → `run()`) and confirmed it **never sends a `sessionId` when starting a new session** — it only learns the real ID after the server responds with the `"start"` SSE event. So on every single new session:
- The reservation ledger entry gets `sessionId: "pending"`.
- The actual session gets a different, real ID generated inside `brainEngine.ts` (e.g. `sess_1750540000_ab12cd`).
- On success, the reconcile/overage entries correctly use `result.sessionId` (the real one) — so those are fine.
- On failure, the refund entry gets `sessionId: "failed"` — again, not the real one.

Net effect: you can't reliably trace a reservation or failure-refund ledger row back to the session it belongs to, because most of them share the literal string `"pending"` or `"failed"` instead of a unique ID. This doesn't lose money, but it breaks auditability of the ledger — which matters a lot given how much care went into making that ledger atomic and immutable in the first place.

### The evidence
`artifacts/gh-brain/src/hooks/useBrainSession.ts`, the `run()` callback (confirmed no `sessionId` field is ever set):
```ts
const request: BrainRunRequest = {
  question: effectiveQuestion,
  config: state.config,
  templateId: state.template?.id,
  idToken,
};
```

`artifacts/api-server/src/routes/brain.ts` (original):
```ts
const { question, config, templateId, sessionId, continueFromTranscript } = req.body as { ... };
// ...
const reserved = await reserveCredits(uid, estimatedCost, sessionId ?? "pending");
// ...
await reconcileCredits(uid, estimatedCost, sessionId ?? "failed", "brain_failure_refund");
```

### The fix — patch to `brain.ts`

Generate the real session ID once, server-side, before any credit reservation happens, and use it consistently everywhere in the request. Full diff:

```diff
--- brain.ts (before)
+++ brain.ts (after)
@@ router.post("/run-brain", async (req, res) => {
-  const { question, config, templateId, sessionId, continueFromTranscript } = req.body as {
+  const { question, config, templateId, sessionId: clientSessionId, continueFromTranscript } = req.body as {
     question: string;
     config: CourtConfig;
     templateId?: string;
     sessionId?: string;
     continueFromTranscript?: string[];
   };

   if (!question?.trim()) {
     res.status(400).json({ message: "question is required" });
     return;
   }

+  // Mint the real session ID here, before any credit movement, so the
+  // reservation, the run, and the failure-refund all reference the SAME id.
+  //
+  // Previously this fell through to `sessionId ?? "pending"` /
+  // `sessionId ?? "failed"` below, because the frontend never sends a
+  // sessionId on a new run (it only learns the id from the "start" SSE
+  // event, which fires after reservation). That meant every fresh session's
+  // reservation and failure-refund ledger entries were stamped with the
+  // literal string "pending" or "failed" instead of the session's real id —
+  // breaking the ability to trace a ledger entry back to its session.
+  //
+  // Resumed sessions (continueFromTranscript) still pass their existing
+  // sessionId from the client and we honor it, since that ID was already
+  // generated server-side on the original run.
+  const sessionId =
+    clientSessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
+
   const effectiveConfig: CourtConfig = config ?? {
     ...
@@
-      const reserved = await reserveCredits(uid, estimatedCost, sessionId ?? "pending");
+      const reserved = await reserveCredits(uid, estimatedCost, sessionId);
@@
-      await reconcileCredits(uid, estimatedCost, sessionId ?? "failed", "brain_failure_refund");
+      await reconcileCredits(uid, estimatedCost, sessionId, "brain_failure_refund");
```

That's the entire diff — 3 logical changes, ~17 lines including the explanatory comment. Everything else in `brain.ts` (the `runBrainSession({ ..., sessionId, ... })` call, the post-run reconcile block using `result.sessionId`) was already correct and needed no changes — `result.sessionId` will now simply always equal this `sessionId`, since `runBrainSession` honors whatever ID it's given.

### Why this is correct
- I deliberately did **not** fix this by having the frontend generate the ID instead — letting a client pick its own session ID and having the server trust it is a worse pattern (collision risk, and it opens the door to a client trying to reference/overwrite a session ID it shouldn't). Generating it server-side, before reservation, and then using that one ID for the rest of the request's lifetime is the correct fix.
- I confirmed the guest-mode branch (no `uid`, no Bearer token) never calls `reserveCredits`/`reconcileCredits` at all, so this change has zero effect on guest sessions — they still get a sessionId for the run itself, just never touch the ledger.
- I confirmed via `grep` that no other code path in `brain.ts` still references the old `sessionId ?? "pending"` / `?? "failed"` pattern after this change.

---

## Fix #4 — Gemini, Grok, and Custom-provider sessions never get real token counts

### The problem
Your billing settlement is designed to use **real, provider-reported token counts** — that's the entire point of `calculateLiveCredits()` in `pricingConfig.ts`, and the comments throughout `creditEngine.ts` say so explicitly. But that only works if the provider actually reports usage back. Looking at all five provider files:

| Provider | Reports real token usage? |
|---|---|
| `anthropic.ts` | ✅ Yes (`message_start`/`message_delta` usage events) |
| `openai.ts` | ✅ Yes (`stream_options: { include_usage: true }`) |
| `gemini.ts` | ❌ No — missing entirely |
| `grok.ts` | ❌ No — missing entirely |
| `custom.ts` | ❌ No — missing entirely |

For the three missing providers, `brainEngine.ts`'s `streamRole()` function falls back to its char-count estimate (`chars / 4`) for *every single session*, not just as an occasional fallback. That means every Gemini and Grok session — and any session using a custom OpenAI-compatible provider you add later — is billed off an approximation, not the real cost, even though your code's own comments say this shouldn't happen.

### The evidence
`brainEngine.ts`, `streamRole()` (unchanged, shown for context — this is the consumer of the bug):
```ts
const realUsage = provider.getLastUsage?.();
if (realUsage && (realUsage.inputTokens > 0 || realUsage.outputTokens > 0)) {
  usage.inputTokens += realUsage.inputTokens;
  usage.outputTokens += realUsage.outputTokens;
} else {
  usage.inputTokens += estimatedInput;
  usage.outputTokens += charsToTokens(output.length);
}
```

`gemini.ts` (original — no `getLastUsage`, no `stream_options`):
```ts
export class GeminiProvider implements AIProvider {
  readonly name: ProviderName = "gemini";
  readonly displayName = "Google Gemini";
  private model: string;
  private client: OpenAI;

  constructor(model = "gemini-2.5-pro", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini not configured — set GEMINI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey,
    });
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      { model: this.model, max_tokens: maxTokens, stream: true, messages },
      { signal }
    );
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
```
`grok.ts` and `custom.ts` had the identical shape, just different base URLs.

### The fix — full corrected files

**`artifacts/api-server/src/lib/providers/gemini.ts`:**
```ts
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class GeminiProvider implements AIProvider {
  readonly name: ProviderName = "gemini";
  readonly displayName = "Google Gemini";
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(model = "gemini-2.5-pro", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini not configured — set GEMINI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey,
    });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    // include_usage is part of the OpenAI-compatible wire format Gemini's
    // endpoint speaks here — same flag OpenAIProvider sets. Without it the
    // brain engine fell back to estimating tokens from character count for
    // every Gemini session, which is what was happening before this fix.
    const stream = await this.client.chat.completions.create(
      { model: this.model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, messages },
      { signal }
    );
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;

      if (chunk.usage) {
        this._lastUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}
```

**`artifacts/api-server/src/lib/providers/grok.ts`:**
```ts
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class GrokProvider implements AIProvider {
  readonly name: ProviderName = "grok";
  readonly displayName = "xAI Grok";
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(model = "grok-3", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["XAI_API_KEY"];
    if (!apiKey) throw new Error("Grok not configured — set XAI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? "https://api.x.ai/v1",
      apiKey,
    });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    // x.ai's API speaks the OpenAI wire format, including stream_options.
    // Without include_usage here the brain engine fell back to estimating
    // tokens from character count for every Grok session.
    const stream = await this.client.chat.completions.create(
      { model: this.model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, messages },
      { signal }
    );
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;

      if (chunk.usage) {
        this._lastUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}
```

**`artifacts/api-server/src/lib/providers/custom.ts`:**
```ts
/**
 * CustomProvider — any OpenAI-compatible API endpoint.
 * Used for future providers added via Admin → API Keys.
 */
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class CustomProvider implements AIProvider {
  readonly name: ProviderName = "openai"; // uses openai-compat wire format
  readonly displayName: string;
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(
    id: string,
    label: string,
    model: string,
    credentials: { key: string; baseUrl: string }
  ) {
    this.name = id as ProviderName;
    this.displayName = label;
    this.model = model;
    this.client = new OpenAI({ apiKey: credentials.key, baseURL: credentials.baseUrl });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    // Custom endpoints are arbitrary third-party OpenAI-compatible APIs —
    // unlike the built-in providers we can't assume stream_options is
    // supported. Try requesting usage; if the endpoint rejects the unknown
    // param, retry once without it rather than failing the whole session.
    // Either way brainEngine.ts's char-count estimate still covers us if
    // chunk.usage never arrives.
    let stream;
    try {
      stream = await this.client.chat.completions.create(
        { model: this.model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, messages },
        { signal }
      );
    } catch {
      stream = await this.client.chat.completions.create(
        { model: this.model, max_tokens: maxTokens, stream: true, messages },
        { signal }
      );
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;

      if (chunk.usage) {
        this._lastUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}
```

### Why this is correct
- `getLastUsage` was already declared **optional** on the `AIProvider` interface (`getLastUsage?(): TokenUsageSnapshot | null`), so the three providers not implementing it was never a type error — just a silent functional gap. This fix implements it, matching the pattern `openai.ts` already proves works.
- Gemini and Grok both genuinely speak the OpenAI-compatible wire format (that's why they're built on the `OpenAI` SDK client in the first place), and `stream_options.include_usage` is the standard mechanism for getting per-chunk usage in that format — the same flag `openai.ts` already uses successfully.

### What I could not verify — please runtime-test
- For `gemini.ts` and `grok.ts`: I can't make a live network call from this sandbox (no network access here) to confirm Google's and x.ai's OpenAI-compatible endpoints actually honor `stream_options.include_usage` and return a populated `usage` field on the final chunk. This is the documented OpenAI streaming convention and both providers advertise OpenAI-compatible endpoints, so I'd expect it to work, but **please run one real session against each before relying on this for billing.** If either doesn't return usage, the existing char-count fallback in `brainEngine.ts` still covers you — you're never worse off, just not better off until confirmed.
- For `custom.ts`: this one's inherently uncertain because "custom" means *any* third-party endpoint someone configures later, with no way to know in advance whether it supports the flag. I added a try/catch that retries without `stream_options` if the first call throws — this should handle a provider that hard-rejects the unknown parameter. I'm fairly confident in this pattern based on how the OpenAI Node SDK handles request validation, but I don't have the SDK source available in this sandbox to step through it line-by-line, so flagging it as lower-certainty than the other fixes in this document.

---

## Files changed — summary

| File | Fix # | Lines changed |
|---|---|---|
| `firestore.rules` | 1 | full rewrite (63 lines) |
| `artifacts/api-server/src/lib/squareEventHandler.ts` | 2 | ~25 lines |
| `artifacts/api-server/src/routes/brain.ts` | 3 | 3 logical changes, ~17 lines |
| `artifacts/api-server/src/lib/providers/gemini.ts` | 4 | full file, +15 lines |
| `artifacts/api-server/src/lib/providers/grok.ts` | 4 | full file, +15 lines |
| `artifacts/api-server/src/lib/providers/custom.ts` | 4 | full file, +20 lines |

## Before deploying, in order:
1. ☐ Set `SQUARE_WEBHOOK_SIGNATURE_KEY` in production (Fix #2 — **do this first**, or purchases stop crediting the moment this deploys)
2. ☐ Deploy `squareEventHandler.ts`, `brain.ts`, `gemini.ts`, `grok.ts`, `custom.ts`
3. ☐ Deploy `firestore.rules` via `firebase deploy --only firestore:rules` — test in sandbox first if possible
4. ☐ Manually confirm: a normal Settings save still works; a hand-crafted `creditBalance` write is rejected; a feedback submission succeeds; one real Gemini and one real Grok session show non-estimated token counts in the session record
