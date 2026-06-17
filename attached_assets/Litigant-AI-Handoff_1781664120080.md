# Litigant AI — Rep Handoff
> Built by Dave (Fluba Designs LLC)  
> Source: `litigant-ai-v2.zip`  
> Live URL: https://litigant-ai.com  
> Slogan: "Don't just ask AI. Put the question on trial."  
> This document supersedes all previous handoff notes.

---

## What This Is

Litigant AI is a multi-AI courtroom reasoning engine. Users submit a question. Multiple AI agents (Advocate, Skeptic, Devil's Advocate, Empiricist, etc.) debate in structured rounds. A Synthesizer delivers a confidence-scored verdict with Final Answer, Key Findings, Artifacts, and Caveats.

**Current completion: ~72%**

---

## Stack

```
Frontend:  React + Vite + Wouter + Tailwind + shadcn/ui + Framer Motion
Backend:   Express 5 + esbuild bundle (pnpm workspaces)
Auth/DB:   Firebase Auth + Firestore
Payments:  Stripe
AI:        OpenAI SDK (with Anthropic SDK installed, not yet wired)
Streaming: SSE (Server-Sent Events)
Deploy:    Firebase Hosting (frontend) + Cloud Run (backend)
```

---

## Where Things Live

```
artifacts/gh-brain/src/pages/          — all frontend pages
artifacts/gh-brain/src/pages/tools/    — 10 SEO tool pages (ToolsIndex, ToolPage)
artifacts/gh-brain/src/pages/app/      — Session, History, Billing, Settings
artifacts/gh-brain/src/pages/admin/    — Admin.tsx (10-tab admin panel)
artifacts/gh-brain/src/pages/auth/     — SignIn, Register, ForgotPassword, VerifyEmail
artifacts/gh-brain/src/services/       — adminService, authService, sessionService, etc.
artifacts/gh-brain/src/hooks/          — useFeatureFlag, useBrainSession, useUserProfile
artifacts/api-server/src/routes/       — brain, sessions, billing, admin, providers, auth
artifacts/api-server/src/lib/          — brainEngine, firebaseAdmin, creditLedger, creditEngine, pricingConfig
artifacts/api-server/docs/credits.md  — full credit system reference (READ THIS)
```

---

## Critical Issues — Fix These First

### 1. Domain Mismatch — SEO Breaking Bug

Every SEO meta tag, canonical URL, and JSON-LD schema in the tools pages references `litigant.ai` but the live domain is `litigant-ai.com`.

**Files to fix:**
- `artifacts/gh-brain/src/pages/tools/ToolsIndex.tsx` — line with `"url": "https://litigant.ai/tools"`
- `artifacts/gh-brain/src/pages/tools/ToolPage.tsx` — all `litigant.ai` references
- `artifacts/gh-brain/src/data/toolPages.ts` (not in zip — find and fix)

**Replace every instance of:**
```
https://litigant.ai  →  https://litigant-ai.com
litigant.ai          →  litigant-ai.com
```

---

### 2. Wire Anthropic API — The Most Important Fix

The Anthropic SDK is already installed (`@anthropic-ai/sdk: ^0.104.2` in `package.json`). Claude models are already in the rate table and multiplier table. The brainEngine currently only uses OpenAI. Claude needs to be wired in.

**Step 1 — Add the Replit Secret:**
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 2 — Create `artifacts/api-server/src/lib/providers/anthropic.ts`:**
```typescript
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export async function streamAnthropicCompletion(
  model: string,
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  maxTokens: number,
  onContent: (text: string) => void,
  signal?: AbortSignal
): Promise<{ inputTokens: number; outputTokens: number }> {
  const anthropic = getAnthropicClient();
  if (!anthropic) throw new Error("Anthropic not configured");

  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
    stream: true,
  });

  for await (const event of stream) {
    if (signal?.aborted) break;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onContent(event.delta.text);
      outputTokens += Math.ceil(event.delta.text.length / 4);
    }
    if (event.type === "message_start" && event.message.usage) {
      inputTokens = event.message.usage.input_tokens;
    }
  }

  return { inputTokens, outputTokens };
}
```

**Step 3 — Create `artifacts/api-server/src/lib/providers/index.ts`:**
```typescript
export type ProviderName = "openai" | "anthropic";

export const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

export const PROVIDER_MODELS: Record<ProviderName, { id: string; label: string; default?: boolean }[]> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o", default: true },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "o4-mini", label: "o4 Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", default: true },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  ],
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5",
};

export function getConfiguredProviders(): ProviderName[] {
  const providers: ProviderName[] = [];
  if (process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] || process.env["OPENAI_API_KEY"]) {
    providers.push("openai");
  }
  if (process.env["ANTHROPIC_API_KEY"]) {
    providers.push("anthropic");
  }
  return providers;
}
```

**Step 4 — Update `brainEngine.ts` to support both providers:**

The brain engine currently calls OpenAI for every role. Update `runBrainSession` to accept an optional `provider` field in `CourtConfig` and route accordingly:

```typescript
// In CourtConfig interface — add:
provider?: "openai" | "anthropic";
model?: string;

// In runBrainSession — replace the OpenAI-only stream call with:
async function streamTurn(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  config: CourtConfig,
  onContent: (text: string) => void,
  signal?: AbortSignal
): Promise<{ inputTokens: number; outputTokens: number }> {
  const provider = config.provider ?? "openai";
  const model = config.model ?? (provider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o");

  if (provider === "anthropic") {
    return streamAnthropicCompletion(
      model,
      [{ role: "user", content: userMessage }],
      systemPrompt,
      maxTokens,
      onContent,
      signal
    );
  }

  // Existing OpenAI path
  let inputTokens = 0;
  let outputTokens = 0;
  const stream = await openai.chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const content = chunk.choices[0]?.delta?.content;
    if (content) { onContent(content); outputTokens += Math.ceil(content.length / 4); }
  }
  return { inputTokens, outputTokens };
}
```

**Step 5 — Add Anthropic to the credit rate table in `creditEngine.ts`:**

These are already in the rate table per `credits.md`. Confirm these exist:
```typescript
"claude-opus-4-5":   { input: 0.0150, output: 0.0750 },
"claude-sonnet-4-5": { input: 0.0030, output: 0.0150 },
"claude-haiku-4-5":  { input: 0.0008, output: 0.0040 },
```

And in `MODEL_MULTIPLIERS`:
```typescript
"claude-opus-4-5":   3,
"claude-sonnet-4-5": 5,
"claude-haiku-4-5":  8,
```

---

### 3. Remove or Wire Templates.tsx

`artifacts/gh-brain/src/pages/app/Templates.tsx` is still in the frontend. The tools pages replaced it for users. Do one of:

**Option A — Remove it cleanly:**
- Delete `Templates.tsx`
- Remove its route from the router
- Remove the nav link if any

**Option B — Keep as admin-only:**
- Gate it behind `requireAdmin` so only you can access it
- Use it as a template management interface feeding the tools system

---

## Feature Flags — Wire These

Flags live in Firestore `config/featureFlags`. Toggle from Admin → Feature Flags tab.

| Flag | What It Does | Action Needed |
|------|-------------|---------------|
| `guestMode` | One free session per IP | ✅ Already works |
| `proUpgrade` | Show Stripe checkout | ✅ Already works |
| `exportPdf` | PDF export of reports | 🔴 Build the PDF export feature |
| `shareReports` | Public share links | ✅ Already works |
| `templateLibrary` | Template selector in session | 🟡 Decide: keep or remove |
| `autoRefill` | Auto credit top-up | 🔴 Build the auto-refill flow |

---

## What to Add — Priority Order

### Priority 1 — Unblocks Revenue
- [ ] Fix domain mismatch (`litigant.ai` → `litigant-ai.com`) everywhere
- [ ] Wire Anthropic API (steps above)
- [ ] Set all required Replit Secrets (see below)
- [ ] Promote Dave to admin via the set-claim endpoint

### Priority 2 — Product Completeness
- [ ] **Per-litigant AI model selection** — the signature feature (see below)
- [ ] Remove or wire `Templates.tsx`
- [ ] PDF export — implement behind `exportPdf` feature flag
- [ ] Auto-refill credits — implement behind `autoRefill` feature flag
- [ ] Mobile testing — verify Session page on Android/iOS

### Priority 3 — Growth
- [ ] Email notifications on session complete
- [ ] Abuse flag resolution workflow in admin (currently shows flags but no dismiss/action)
- [ ] Durability for guest sessions (replace in-memory Set with Firestore `guest_sessions`)
- [ ] Add Grok and Gemini providers when API access is available

---

## The Signature Feature: Per-Litigant AI Model

This is the marketing headline. **Different AI models argue against each other.**

> Advocate = Claude Sonnet. Skeptic = GPT-4o. Devil's Advocate = Grok. Empiricist = Gemini.

**How to build it:**

1. Add a `roleProviders` map to `CourtConfig`:
```typescript
roleProviders?: Record<string, { provider: "openai" | "anthropic"; model: string }>;
```

2. In `runBrainSession`, look up each role's provider before calling the stream function:
```typescript
const roleConfig = config.roleProviders?.[role.name] ?? {
  provider: config.provider ?? "openai",
  model: config.model ?? "gpt-4o"
};
```

3. In the Session UI, add a per-role model selector (show only when user is Pro).

4. Add a feature flag `multiProviderRoles` — gate to Pro plan only.

This feature exists nowhere else at this price point. It is the differentiator.

---

## All Required Replit Secrets

Set all of these in Replit Secrets before any testing:

```
# Firebase
FIREBASE_SERVICE_ACCOUNT        = <service account JSON string>
VITE_FIREBASE_API_KEY           = <from Firebase console>
VITE_FIREBASE_AUTH_DOMAIN       = litigant-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID        = litigant-ai
VITE_FIREBASE_STORAGE_BUCKET    = litigant-ai.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID = <from Firebase console>
VITE_FIREBASE_APP_ID            = <from Firebase console>

# AI Providers
AI_INTEGRATIONS_OPENAI_BASE_URL = https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY  = sk-proj-...
ANTHROPIC_API_KEY               = sk-ant-...

# Admin
ADMIN_MASTER_SECRET             = <choose a strong secret>

# Stripe
STRIPE_SECRET_KEY               = sk_live_...
STRIPE_WEBHOOK_SECRET           = whsec_...
VITE_STRIPE_PUBLISHABLE_KEY     = pk_live_...
```

**NEVER put any of these in any source file.**

---

## Admin Setup (One-Time After Deploy)

### Promote Dave to admin:
```bash
curl -X POST https://litigant-ai.com/api/admin/set-claim \
  -H "Content-Type: application/json" \
  -d '{"secret":"<ADMIN_MASTER_SECRET>","email":"perceys@gmail.com"}'
```

Then sign out and sign back in. The Admin link appears in the nav.

### Seed feature flags:
From the Admin panel → Feature Flags tab, the flags auto-populate from Firestore on first use.

### Set Stripe product IDs:
In the Billing page (`artifacts/gh-brain/src/pages/app/Billing.tsx`), confirm the Stripe price IDs match your live Stripe products.

---

## Credit System Summary

**1 credit = $0.01 USD**

Every session:
1. Estimates credits upfront → atomically reserves from balance
2. Streams the AI debate
3. Settles with real token counts → refunds the difference if estimate was high

Every balance change writes an immutable `credit_transactions` ledger entry. The admin can adjust multipliers per model from Firestore without redeploying.

**Signup bonus:** 50 free credits on first verified login (idempotent — never double-grants).

**Guest mode:** 1 free session per server IP, then 402 with `guestLimitReached: true`.

Full credit system documentation: `artifacts/api-server/docs/credits.md`

---

## Adding a New AI Model (Future)

1. Add rate to `MODEL_RATES` in `creditEngine.ts`
2. Add multiplier to `MODEL_MULTIPLIERS` in `creditEngine.ts`
3. Add metadata to `MODEL_META` in `pricingConfig.ts`
4. Add to provider's model list in `providers/index.ts`
5. Done — no other files need changing

---

## Firestore Collections

```
users/                  — auth, credits, plan, subscription status
sessions/               — every brain session
  session_turns/        — subcollection, one doc per turn
credit_transactions/    — immutable ledger, every balance movement
stripe_events/          — idempotency keys for Stripe webhooks
config/featureFlags     — feature flag document
config/pricing          — admin-editable multiplier overrides
config/apiKeys          — server-side API keys (never returned to client)
```

---

## Architecture Rules (Do Not Break)

- All credit mutations go through `addCredits()` / `reserveCredits()` / `reconcileCredits()` — **never** raw `FieldValue.increment()`
- Every credit mutation writes an immutable `credit_transactions` entry
- Admin routes check `admin: true` Firebase custom claim via `requireAdmin` middleware
- Stripe webhook idempotency checked via `stripe_events/{eventId}` before any credit grant
- API keys stored in Firestore `config/apiKeys` — never in environment variables visible to the client
- Firebase not configured → app runs gracefully in guest mode

---

## Current Completion by Area

| Area | % Done | Blocking Issue |
|------|--------|----------------|
| Brain engine (OpenAI) | 100% | — |
| Brain engine (Anthropic) | 0% | API key + provider adapter not built |
| Credit system | 100% | — |
| Stripe billing | 95% | Price IDs need confirming |
| Firebase Auth | 100% | — |
| Session history | 100% | — |
| Share reports | 100% | — |
| Admin panel | 100% | — |
| Tools/SEO pages | 90% | Domain mismatch |
| PDF export | 0% | Feature flag exists, feature not built |
| Auto-refill | 0% | Feature flag exists, feature not built |
| Per-litigant AI | 0% | Architecture ready, not implemented |
| Mobile | Unknown | Needs testing |
| **Overall** | **~72%** | Anthropic + domain mismatch are critical path |

---

## Notes for Rep

- The Anthropic SDK is already installed — this is a code task, not a dependency task
- `credits.md` in `artifacts/api-server/docs/` is the definitive credit system reference — read it before touching any billing code
- The tools pages (`/tools/*`) are the SEO growth engine — every domain fix here matters
- `Templates.tsx` is dead user-facing code — decide with Dave whether to remove or repurpose before the next deploy
- The per-litigant AI model feature is the product's biggest differentiator — prioritize it after Anthropic is wired
- Guest mode resets on server restart by design — durability via Firestore is a nice-to-have, not blocking

---

*Built by Dave (Fluba Designs LLC) with Ghost and Claude (Anthropic)*  
*This document is the single authority for Litigant AI Rep handoff*
