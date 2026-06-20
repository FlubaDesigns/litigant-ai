# Litigant AI — Credit System Reference

## Overview

The credit system is the financial backbone of the platform. Users buy credits; the engine consumes them; every movement is ledgered atomically in Firestore. This document is the single authoritative reference for how credits work end-to-end.

---

## 1. The Unit: What Is a Credit?

```
1 credit = $0.01 USD  (CREDIT_VALUE_USD in creditEngine.ts)
```

Credits are the only denomination users ever see. They never see tokens, they never see raw USD model costs. The credit abstraction:

- Lets you change your margin on any model instantly (via the Admin → Pricing multiplier) without touching any frontend code.
- Keeps the billing surface simple: users top up credits, sessions cost credits, the ledger tracks credits.

---

## 2. The Pricing Formula

Every session's credit cost is derived from actual token usage:

```
credits = ceil( (inputTokens/1000 × inputRate + outputTokens/1000 × outputRate) × multiplier / CREDIT_VALUE_USD )
          with a floor of 1
```

Where:
- `inputRate` / `outputRate` — USD per 1 000 tokens for the chosen model (see §3).
- `multiplier` — your markup factor for that model (see §4). Can be overridden live via Firestore without redeploying.
- `CREDIT_VALUE_USD = 0.01` — constant; never changes unless you decide to redenominate.

### Example

A `gpt-4o` session consuming 13 000 input tokens and 5 600 output tokens with the default 5× multiplier:

```
cost_usd = (13000/1000 × 0.0025) + (5600/1000 × 0.0100)
         = 0.0325 + 0.056
         = 0.0885 USD

credits = ceil(0.0885 × 5 / 0.01) = ceil(44.25) = 45 credits
```

Cost to user: $0.45. Your raw API cost: ~$0.089. Margin: ~5×.

---

## 3. Model Rate Table

Defined in `src/lib/creditEngine.ts → MODEL_RATES`. All values are **USD per 1 000 tokens**.

| Model               | Provider  | Input /1K  | Output /1K |
|---------------------|-----------|------------ |------------|
| gpt-4o              | OpenAI    | $0.0025    | $0.0100    |
| gpt-4o-mini         | OpenAI    | $0.00015   | $0.0006    |
| o3                  | OpenAI    | $0.0100    | $0.0400    |
| o4-mini             | OpenAI    | $0.0011    | $0.0044    |
| claude-opus-4-5     | Anthropic | $0.0150    | $0.0750    |
| claude-sonnet-4-5   | Anthropic | $0.0030    | $0.0150    |
| claude-haiku-4-5    | Anthropic | $0.0008    | $0.0040    |
| grok-3              | xAI Grok  | $0.0030    | $0.0150    |
| grok-3-mini         | xAI Grok  | $0.0003    | $0.0005    |
| grok-2              | xAI Grok  | $0.0020    | $0.0100    |
| gemini-2.5-pro      | Gemini    | $0.00125   | $0.0100    |
| gemini-2.5-flash    | Gemini    | $0.00015   | $0.0006    |
| gemini-2.0-flash    | Gemini    | $0.00010   | $0.0004    |

**Unknown models** fall back to `{ input: 0.003, output: 0.015 }` (conservative).

---

## 4. Multipliers

Defined in `src/lib/creditEngine.ts → MODEL_MULTIPLIERS`. These are your **default** markups:

| Model               | Default Multiplier | Reasoning |
|---------------------|--------------------|-----------|
| gpt-4o              | 5×                 | Flagship; users expect fair pricing |
| gpt-4o-mini         | 8×                 | Cheap model — higher margin, still affordable |
| o3                  | 4×                 | Expensive reasoning model — stay competitive |
| o4-mini             | 6×                 | Balanced reasoning |
| claude-opus-4-5     | 3×                 | Most expensive Anthropic model |
| claude-sonnet-4-5   | 5×                 | Mid-tier |
| claude-haiku-4-5    | 8×                 | Fast and cheap |
| grok-3              | 5×                 | Mid-tier |
| grok-3-mini         | 8×                 | Very cheap |
| grok-2              | 5×                 | Previous-gen |
| gemini-2.5-pro      | 5×                 | Google flagship |
| gemini-2.5-flash    | 10×                | Extremely cheap model |
| gemini-2.0-flash    | 10×                | Extremely cheap model |

**Unknown models** fall back to `5×`.

### Overriding Multipliers at Runtime

Multipliers can be changed **without redeploying** via Admin → Pricing or directly via the API:

```
PUT /admin/api-keys/:model
{ "multiplier": 7 }
```

Overrides are stored in Firestore at `config/pricing → { multipliers: { "gpt-4o": 7 } }`.

The server caches the overrides for **60 seconds** (`CACHE_TTL_MS` in `pricingConfig.ts`). After a write, the cache is immediately invalidated so the next request picks up the new value.

Priority: Firestore override → hardcoded default in `MODEL_MULTIPLIERS`.

---

## 5. Session Credit Lifecycle

Every authenticated session goes through three phases:

### Phase 1 — Pre-run Estimation (optimistic reservation)

Before the AI starts, the server estimates how many credits the session will consume using `estimateSessionCredits()` in `creditEngine.ts`. This estimate is intentionally **conservative** (slightly high) to ensure the reservation covers the full run.

The estimate is based on:
- `litigantCount` — number of AI roles
- `maxIterations` — number of debate rounds
- `responseMode` — token budget per turn (concise: 300, balanced: 600, thorough: 1200)
- `model` — used to apply the rate table

The estimated amount is **atomically deducted** from the user's balance in a single Firestore transaction that also writes a `credit_transactions` ledger entry (`type: "usage"`, `source: "brain_reservation"`).

If the balance is insufficient, the request is rejected with HTTP 402 before any AI call is made.

### Phase 2 — The AI Run

The brain engine streams output from the AI model. As each token arrives it is counted. `brainEngine.ts` accumulates:

```ts
usage.inputTokens  // estimated via (chars / 4) per message batch
usage.outputTokens // counted character-by-character as the stream arrives
```

### Phase 3 — Settlement (reconciliation)

After the session completes, the server calculates the **actual** credit cost using real token counts and the **live Firestore multiplier** via `calculateLiveCredits()` in `pricingConfig.ts`.

```
actual_cost = calculateLiveCredits(model, inputTokens, outputTokens)
```

**If actual < estimated** (the common case — estimation is conservative):

```
refund = estimated - actual
```

A reconciliation ledger entry (`type: "refund"`, `source: "brain_reconcile"`) is written atomically and the balance is restored.

**If actual > estimated** (rare — would require the session to far exceed its estimated rounds):

The overage is charged as a second `reserveCredits()` call. This is non-fatal: if it fails, the session result is still delivered; only the accounting is incomplete.

**If the run fails before completing**:

The full reservation is refunded via `reconcileCredits(..., "brain_failure_refund")`. The user loses nothing.

### Summary Diagram

```
Request received
    │
    ├─ No auth header → Guest mode (1 free session per IP, then 402)
    │
    └─ Bearer token → verify Firebase ID token
           │
           └─ estimateSessionCredits()
                  │
                  └─ reserveCredits() — atomic Firestore txn
                         │
                         ├─ balance < estimate → 402 Insufficient credits
                         │
                         └─ OK → deduct estimate, write ledger entry
                                │
                                └─ runBrainSession() ← streams SSE to client
                                       │
                                       ├─ Success
                                       │     │
                                       │     └─ calculateLiveCredits() with real tokens
                                       │             │
                                       │             ├─ actual < estimated → reconcileCredits (refund)
                                       │             ├─ actual > estimated → reserveCredits (charge overage)
                                       │             └─ persist session to Firestore
                                       │
                                       └─ Failure
                                             │
                                             └─ reconcileCredits (full refund of reservation)
```

---

## 6. Credit Sources

Users acquire credits through several paths. All are handled by `addCredits()` in `creditLedger.ts`, which is the **only** function that may modify a user's `creditBalance`.

| Source              | `CreditTxType`        | When it fires |
|---------------------|-----------------------|---------------|
| Square purchase     | `purchase`            | Square `payment.updated` webhook |
| Subscription grant  | `subscription_grant`  | Subscription renewal webhook |
| Signup bonus        | `signup_bonus`        | First login after email verification (100 credits, idempotent) |
| Admin adjustment    | `admin_adjustment`    | `POST /admin/users/:uid/credits` |
| Brain usage         | `usage`               | Session credit reservation |
| Reconciliation refund | `refund`            | Post-session settlement or failure |

### Idempotency

`addCredits()` accepts an optional `idempotencyKey`. When provided:
1. The key is checked against `square_events` collection before any write.
2. If found → operation is skipped (`{ skipped: true }` returned).
3. If not found → key is written atomically alongside the balance mutation.

This prevents Square webhooks from double-granting credits if delivered more than once.

---

## 7. Firestore Schema

### `users/{uid}`

| Field               | Type     | Description |
|---------------------|----------|-------------|
| `creditBalance`     | number   | Current balance in credits |
| `plan`              | string   | `"free"` \| `"starter"` \| `"pro"` \| `"team"` |
| `subscriptionStatus`| string   | `"none"` \| `"active"` \| `"cancelled"` \| `"past_due"` |
| `squareCustomerId`  | string?  | Square customer ID for lookup |
| `autoRefill`        | object?  | `{ enabled, thresholdCredits, packPriceId }` |
| `updatedAt`         | Timestamp| Last balance change |

### `credit_transactions/{auto-id}`

Every balance movement — in either direction — writes one immutable document here.

| Field               | Type     | Description |
|---------------------|----------|-------------|
| `userId`            | string   | Firebase UID |
| `type`              | string   | One of the `CreditTxType` values |
| `amount`            | number   | Positive = credit grant; negative = deduction |
| `balanceAfter`      | number   | Balance after this transaction |
| `source`            | string   | Human-readable event source (e.g. `"brain_reservation"`, `"square_checkout"`) |
| `sessionId`         | string?  | Brain session ID if usage-related |
| `squarePaymentId`   | string?  | Square payment ID |
| `createdAt`         | Timestamp| Immutable write time |

### `config/pricing`

Admin-editable multiplier overrides.

```json
{
  "multipliers": {
    "gpt-4o": 7,
    "claude-opus-4-5": 4
  },
  "updatedAt": "<Timestamp>"
}
```

Models not listed here use the hardcoded defaults from `MODEL_MULTIPLIERS`.

### `config/apiKeys`

Firestore-stored API keys (server-side only, never returned to clients in full).

```json
{
  "providers": {
    "openai": {
      "key": "<full key>",
      "label": "OpenAI",
      "maskedKey": "sk-proj-••••••••AbCd",
      "updatedAt": "<Timestamp>"
    },
    "my-custom-llm": {
      "key": "<full key>",
      "label": "My Custom LLM",
      "baseUrl": "https://api.example.com/v1",
      "maskedKey": "sk-••••••••1234",
      "updatedAt": "<Timestamp>"
    }
  }
}
```

---

## 8. Guest Mode

Users without a Firebase auth token get exactly **one free session** per server IP address. The IP is tracked in an in-memory `Set<string>` (`guestSessionIPs` in `brain.ts`).

Implications:
- The guest limit resets on server restart (by design — guests are just for trial).
- When Firebase is configured, Firestore's `guest_sessions` collection can replace this for durability (not yet implemented).
- After the free session, the 402 response includes `guestLimitReached: true` so the frontend can show a signup prompt.

---

## 9. Key Files

| File | Responsibility |
|------|---------------|
| `src/lib/creditEngine.ts` | Rate table, multipliers, all pricing math (`calculateActualCredits`, `estimateSessionCredits`, `usdToCredits`) |
| `src/lib/pricingConfig.ts` | Firestore-backed live multiplier overrides; `calculateLiveCredits` (used for settlement) |
| `src/lib/creditLedger.ts` | `addCredits()` — the only function that mutates `creditBalance`; idempotency logic; `getTransactions()` |
| `src/routes/brain.ts` | `reserveCredits()`, `reconcileCredits()` — session-scoped credit transactions; the full pre/post-run lifecycle |
| `src/routes/admin.ts` | `GET/PUT/DELETE /admin/pricing/:model` — admin multiplier management |

---

## 10. Adding a New Model

1. **Add the rate** to `MODEL_RATES` in `creditEngine.ts`:
   ```ts
   "my-new-model": { input: 0.002, output: 0.008 },
   ```

2. **Add the default multiplier** to `MODEL_MULTIPLIERS`:
   ```ts
   "my-new-model": 5,
   ```

3. **Add the model metadata** to `MODEL_META` in `pricingConfig.ts` (for the admin pricing table):
   ```ts
   "my-new-model": { provider: "openai", label: "My New Model" },
   ```

4. **Add it to the provider's model list** in `src/lib/providers/types.ts → PROVIDER_MODELS`.

5. (Optional) **Override the multiplier** live via Admin → Pricing without redeploying.

No other files need to change. The credit formula, reservation flow, and settlement flow all work automatically with the new model's rate.

---

## 11. Auto-Refill

Users can opt into automatic credit top-ups. Stored in `users/{uid}.autoRefill`:

```ts
{
  enabled: true,
  thresholdCredits: 50,   // trigger when balance drops below this
  packPriceId: "price_xxx" // Stripe price ID of the pack to purchase
}
```

`checkAndTriggerAutoRefill()` in `creditLedger.ts` is called after any balance deduction. If the new balance is below the threshold and auto-refill is enabled, it generates a Stripe Checkout URL and writes it to `users/{uid}.autoRefillCheckoutUrl`. The frontend polls this field and redirects the user to complete the purchase.
