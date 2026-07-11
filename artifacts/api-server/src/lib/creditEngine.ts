/**
 * Credit Engine — the mathematical heart of the billing system.
 *
 * ## Core concept
 *   1 credit = $0.01 USD  (CREDIT_VALUE_USD)
 *
 * ## Pricing formula
 *   credits = ceil(
 *     (inputTokens/1000 × inputRate + outputTokens/1000 × outputRate)
 *     × multiplier
 *     / CREDIT_VALUE_USD
 *   )  with a floor of 1.
 *
 * ## Two-phase cost model
 *   Phase 1 — Pre-run: estimateSessionCredits() returns a conservative
 *             upper-bound used for the upfront credit reservation.
 *   Phase 2 — Post-run: calculateActualCredits() + the live Firestore
 *             multiplier (pricingConfig.ts → calculateLiveCredits) settle
 *             the true cost; any over-reservation is refunded.
 *
 * ## Multipliers
 *   Every model has a default markup multiplier (MODEL_MULTIPLIERS).
 *   Admins can override any multiplier live via Firestore without
 *   redeploying — see pricingConfig.ts.
 *
 * ## Adding a new model
 *   1. Add its rate to MODEL_RATES.
 *   2. Add its default multiplier to MODEL_MULTIPLIERS.
 *   3. Add metadata to MODEL_META in pricingConfig.ts (for the admin table).
 *   4. Add it to PROVIDER_MODELS in providers/types.ts.
 *   Nothing else needs to change — the formula applies automatically.
 *
 * See docs/credits.md for the full system reference.
 */

/** Fixed exchange rate: 1 credit costs the user $0.01 USD. Never changes. */
export const CREDIT_VALUE_USD = 0.01;

// ── Token rates (USD per 1K tokens) ──────────────────────────────────────────
// Source: provider published pricing pages as of June 2026.
// Update here whenever a provider changes its pricing.
export interface ModelRate {
  /** USD per 1 000 input/prompt tokens */
  input: number;
  /** USD per 1 000 output/completion tokens */
  output: number;
}

/**
 * Published API costs per 1 000 tokens for each supported model.
 * These are your COST — what you pay the provider.
 * What the user pays is this × multiplier / CREDIT_VALUE_USD.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  "gpt-4o":            { input: 0.0025,  output: 0.0100 },
  "gpt-4o-mini":       { input: 0.00015, output: 0.0006 },
  "o3":                { input: 0.0100,  output: 0.0400 },  // reasoning — expensive
  "o4-mini":           { input: 0.0011,  output: 0.0044 },  // reasoning — mid-tier
  // ── Anthropic ───────────────────────────────────────────────────────────────
  "claude-opus-4-5":   { input: 0.0150,  output: 0.0750 },  // most expensive per token
  "claude-sonnet-4-5": { input: 0.0030,  output: 0.0150 },
  "claude-haiku-4-5":  { input: 0.0008,  output: 0.0040 },  // fast and cheap
  // ── xAI Grok ────────────────────────────────────────────────────────────────
  "grok-3":            { input: 0.0030,  output: 0.0150 },
  "grok-3-mini":       { input: 0.0003,  output: 0.0005 },  // very cheap
  "grok-2":            { input: 0.0020,  output: 0.0100 },
  // ── Google Gemini ────────────────────────────────────────────────────────────
  "gemini-2.5-pro":    { input: 0.00125, output: 0.0100 },
  "gemini-2.5-flash":  { input: 0.00015, output: 0.0006 },
  "gemini-2.0-flash":  { input: 0.00010, output: 0.0004 },  // cheapest per token
};

// ── Default markup multipliers ────────────────────────────────────────────────
/**
 * How many times the raw API cost you collect from the user by default.
 * e.g. multiplier=5 means if the API call costs $0.09, you charge the user
 * credits worth $0.45.
 *
 * Design principles:
 *   - Cheaper models → higher multiplier (users don't feel it; you earn more).
 *   - Expensive models → lower multiplier (stay price-competitive vs. direct access).
 *   - All defaults are intentionally round numbers for predictability.
 *
 * These defaults can be overridden live by admins via Firestore (no redeploy).
 * See pricingConfig.ts and Admin → Pricing.
 */
export const MODEL_MULTIPLIERS: Record<string, number> = {
  // OpenAI
  "gpt-4o":            5,
  "gpt-4o-mini":       8,
  "o3":                4,   // expensive — lower margin to stay competitive
  "o4-mini":           6,
  // Anthropic
  "claude-opus-4-5":   3,   // most expensive model — lowest margin
  "claude-sonnet-4-5": 5,
  "claude-haiku-4-5":  8,
  // xAI Grok
  "grok-3":            5,
  "grok-3-mini":       8,
  "grok-2":            5,
  // Google Gemini
  "gemini-2.5-pro":    5,
  "gemini-2.5-flash":  10,  // extremely cheap → very high margin
  "gemini-2.0-flash":  10,
};

/** Fallback rate for models not in MODEL_RATES (conservative assumption) */
const DEFAULT_RATE: ModelRate = { input: 0.003, output: 0.015 };

/** Fallback multiplier for models not in MODEL_MULTIPLIERS */
const DEFAULT_MULTIPLIER = 5;

/** Returns the token rate for a model, falling back to DEFAULT_RATE. */
export function getModelRate(model: string): ModelRate {
  return MODEL_RATES[model] ?? DEFAULT_RATE;
}

/**
 * Returns the hardcoded default multiplier for a model.
 *
 * NOTE: For the live (admin-overridable) multiplier, use
 * pricingConfig.ts → getEffectiveMultiplier() instead.
 * This function is for pre-run estimates where a Firestore round-trip
 * is not worth the latency.
 */
export function getModelMultiplier(model: string): number {
  return MODEL_MULTIPLIERS[model] ?? DEFAULT_MULTIPLIER;
}

/**
 * Converts a raw USD amount into credits using the given model's multiplier.
 *
 * Formula: ceil(usd × multiplier / CREDIT_VALUE_USD), minimum 1.
 *
 * NOTE: Uses the hardcoded multiplier. For post-run settlement with the
 * live Firestore multiplier, call pricingConfig.ts → calculateLiveCredits().
 */
export function usdToCredits(usd: number, model: string): number {
  const multiplier = getModelMultiplier(model);
  return Math.max(1, Math.ceil((usd * multiplier) / CREDIT_VALUE_USD));
}

/**
 * Calculates the exact credit cost from real, post-run token counts.
 *
 * Used during the pre-run phase where the Firestore multiplier override
 * doesn't need to be applied (estimation only). For actual settlement,
 * call pricingConfig.ts → calculateLiveCredits() which reads the live
 * admin-configurable multiplier.
 *
 * @param model - The AI model ID used in the session.
 * @param inputTokens - Total input/prompt tokens consumed.
 * @param outputTokens - Total output/completion tokens generated.
 */
export function calculateActualCredits(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = getModelRate(model);
  const costUSD = (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  return usdToCredits(costUSD, model);
}

/**
 * Estimates character count → token count.
 * Rule of thumb: 4 characters ≈ 1 token (OpenAI's published approximation).
 * Used for input token estimation when exact prompt lengths aren't tracked.
 */
export function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export type ResponseMode = "concise" | "balanced" | "thorough";

export interface SessionEstimateConfig {
  litigantCount: number;
  maxIterations: number;
  responseMode: ResponseMode;
  /** Defaults to "gpt-4o" if omitted. */
  model?: string;
}

/**
 * Estimates total credit cost BEFORE a session runs.
 *
 * This is used for the upfront credit reservation (see brain.ts → reserveCredits).
 * The estimate is intentionally CONSERVATIVE (slightly high) so the reservation
 * will cover the actual cost in the common case, minimising reconciliation refunds
 * while still catching under-funded accounts before any AI call is made.
 *
 * ## How the estimate is built
 *
 * Output tokens per turn (by responseMode):
 *   concise: 300 / balanced: 600 / thorough: 1200
 *
 * Total output = orchestrator (400) + litigants × rounds × tokensPerTurn + verdict (1600)
 *
 * Input tokens grow each round because the AI sees the full transcript so far.
 * We model this as: base system prompt (600 tokens) plus an average history
 * that is 50% of the final round's accumulated transcript.
 * An additional 8000 tokens are added for the final verdict's large context.
 *
 * The model's HARDCODED multiplier (not Firestore override) is used here —
 * a Firestore round-trip before reservation isn't worth the latency.
 * The post-run settlement (calculateLiveCredits) will apply the real multiplier.
 */
/**
 * Hardcoded prior for the five fixed pipeline stages (Moderator, Architect,
 * Builder, Auditor, Verdict) — everything that runs after the debate loop.
 *
 * Output: 5 stages × average max tokens (5 400 total) at 70% fill ≈ 3 780.
 * Input:  accumulated context fed to those five stages ≈ 12 500 tokens.
 *
 * These values are used until getCalibratedFixedStageTokens() has at least
 * CALIBRATION_MIN_SESSIONS real sessions to average over, at which point
 * observed data takes over automatically.
 */
export const FIXED_STAGE_PRIOR = { input: 12_500, output: 3_780 };

/** Minimum sessions required before switching from prior to observed data. */
const CALIBRATION_MIN_SESSIONS = 5;
const CALIBRATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _calCache: { input: number; output: number } | null = null;
let _calExpiry = 0;

/**
 * Returns the average fixed-stage token usage across the last 50 completed
 * sessions. Falls back to FIXED_STAGE_PRIOR until at least CALIBRATION_MIN_SESSIONS
 * sessions have saved fixedStageTokens data.
 *
 * Result is cached for 5 minutes — one Firestore query serves every estimate
 * until the cache expires.
 */
export async function getCalibratedFixedStageTokens(): Promise<{ input: number; output: number }> {
  const now = Date.now();
  if (_calCache !== null && now < _calExpiry) return _calCache;

  // Lazy import to keep this module free of top-level side effects when Firebase
  // is not configured (e.g. unit tests, local dev without credentials).
  const { getFirestoreDb } = await import("./firebaseAdmin.js");
  const db = getFirestoreDb();
  if (!db) return FIXED_STAGE_PRIOR;

  try {
    const snap = await db
      .collection("sessions")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const records = snap.docs
      .map((d) => d.data().fixedStageTokens as { input: number; output: number } | undefined)
      .filter((r): r is { input: number; output: number } => !!r && r.input > 0 && r.output > 0);

    if (records.length < CALIBRATION_MIN_SESSIONS) return FIXED_STAGE_PRIOR;

    const avg = {
      input:  Math.round(records.reduce((s, r) => s + r.input,  0) / records.length),
      output: Math.round(records.reduce((s, r) => s + r.output, 0) / records.length),
    };

    _calCache = avg;
    _calExpiry = now + CALIBRATION_CACHE_TTL_MS;
    return avg;
  } catch {
    return FIXED_STAGE_PRIOR;
  }
}

/**
 * Builds the variable (litigant + orchestrator open) token counts from config.
 * Shared by both the sync and async estimators so the formula stays in one place.
 */
function variableTokens(config: SessionEstimateConfig): { input: number; output: number } {
  const outputTokensPerTurn: Record<ResponseMode, number> = {
    concise:  300,
    balanced: 600,
    thorough: 1200,
  };
  const tokensPerTurn   = outputTokensPerTurn[config.responseMode];
  const rounds          = config.maxIterations;
  const litigants       = Math.min(config.litigantCount, 10);
  const historyPerRound = tokensPerTurn * litigants * 0.8;
  const avgInputPerTurn = 600 + historyPerRound * (rounds / 2);
  return {
    output: 400 + litigants * rounds * tokensPerTurn,
    input:  litigants * rounds * avgInputPerTurn,
  };
}

export function estimateSessionCredits(config: SessionEstimateConfig): number {
  const v = variableTokens(config);
  const outputTokens = v.output + FIXED_STAGE_PRIOR.output;
  const inputTokens  = v.input  + FIXED_STAGE_PRIOR.input;
  const model = config.model ?? "gpt-4o";
  return calculateActualCredits(model, Math.ceil(inputTokens), outputTokens);
}

/**
 * Async variant of estimateSessionCredits that replaces the hardcoded
 * FIXED_STAGE_PRIOR with real averages learned from the last 50 sessions.
 *
 * Use this anywhere a Firestore round-trip is already expected (brain.ts
 * reservation, admin pricing table). The sync version remains for contexts
 * where you need an instant result (frontend slider maths, unit tests).
 */
export async function estimateSessionCreditsCalibrated(
  config: SessionEstimateConfig
): Promise<number> {
  const fixed = await getCalibratedFixedStageTokens();
  const v = variableTokens(config);
  const outputTokens = v.output + fixed.output;
  const inputTokens  = v.input  + fixed.input;
  const model = config.model ?? "gpt-4o";
  return calculateActualCredits(model, Math.ceil(inputTokens), outputTokens);
}

/**
 * Snapshot of a model's pricing data sent to the frontend.
 *
 * The frontend uses this to compute live credit estimates as the user
 * moves the litigant/round/responseMode sliders — without a round-trip
 * per slider change.
 */
export interface ModelCreditInfo {
  model: string;
  /** Hardcoded default multiplier (not Firestore override) */
  multiplier: number;
  inputRatePer1k: number;
  outputRatePer1k: number;
  creditValueUsd: number;
  /**
   * Pre-computed example: default session
   * (3 litigants, 2 rounds, balanced response mode).
   */
  exampleSessionCredits: number;
}

/** Builds the ModelCreditInfo snapshot for a given model. */
export function getModelCreditInfo(model: string): ModelCreditInfo {
  const rate = getModelRate(model);
  return {
    model,
    multiplier:         getModelMultiplier(model),
    inputRatePer1k:     rate.input,
    outputRatePer1k:    rate.output,
    creditValueUsd:     CREDIT_VALUE_USD,
    exampleSessionCredits: estimateSessionCredits({
      litigantCount: 3,
      maxIterations: 2,
      responseMode:  "balanced",
      model,
    }),
  };
}
