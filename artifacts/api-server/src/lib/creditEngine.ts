/**
 * Credit Engine — single source of truth for all pricing logic.
 *
 * 1 credit = $0.01 USD (CREDIT_VALUE_USD)
 * Every model has a token rate (cost per 1K tokens) and a markup multiplier.
 * Multiplier is what you earn on top of the raw API cost.
 * Users see credits, never tokens, never dollars.
 */

export const CREDIT_VALUE_USD = 0.01;

// ── Token rates (USD per 1K tokens) ──────────────────────────────────────────
export interface ModelRate {
  input: number;  // USD per 1K input tokens
  output: number; // USD per 1K output tokens
}

export const MODEL_RATES: Record<string, ModelRate> = {
  // OpenAI
  "gpt-4o":           { input: 0.0025,  output: 0.0100 },
  "gpt-4o-mini":      { input: 0.00015, output: 0.0006 },
  "o3":               { input: 0.0100,  output: 0.0400 },
  "o4-mini":          { input: 0.0011,  output: 0.0044 },
  // Anthropic
  "claude-opus-4-5":  { input: 0.0150,  output: 0.0750 },
  "claude-sonnet-4-5":{ input: 0.0030,  output: 0.0150 },
  "claude-haiku-4-5": { input: 0.0008,  output: 0.0040 },
  // xAI Grok
  "grok-3":           { input: 0.0030,  output: 0.0150 },
  "grok-3-mini":      { input: 0.0003,  output: 0.0005 },
  "grok-2":           { input: 0.0020,  output: 0.0100 },
  // Google Gemini
  "gemini-2.5-pro":   { input: 0.00125, output: 0.0100 },
  "gemini-2.5-flash": { input: 0.00015, output: 0.0006 },
  "gemini-2.0-flash": { input: 0.00010, output: 0.0004 },
};

// ── Per-model markup multipliers ──────────────────────────────────────────────
// You collect this multiple of what you pay in API costs.
// Higher multiplier on cheap models (users don't feel it),
// lower on expensive ones (stay competitive).
export const MODEL_MULTIPLIERS: Record<string, number> = {
  "gpt-4o":            5,
  "gpt-4o-mini":       8,
  "o3":                4,
  "o4-mini":           6,
  "claude-opus-4-5":   3,
  "claude-sonnet-4-5": 5,
  "claude-haiku-4-5":  8,
  "grok-3":            5,
  "grok-3-mini":       8,
  "grok-2":            5,
  "gemini-2.5-pro":    5,
  "gemini-2.5-flash":  10,
  "gemini-2.0-flash":  10,
};

const DEFAULT_RATE: ModelRate = { input: 0.003, output: 0.015 };
const DEFAULT_MULTIPLIER = 5;

export function getModelRate(model: string): ModelRate {
  return MODEL_RATES[model] ?? DEFAULT_RATE;
}

export function getModelMultiplier(model: string): number {
  return MODEL_MULTIPLIERS[model] ?? DEFAULT_MULTIPLIER;
}

/** Convert raw USD cost → credits (always rounds up, minimum 1) */
export function usdToCredits(usd: number, model: string): number {
  const multiplier = getModelMultiplier(model);
  return Math.max(1, Math.ceil((usd * multiplier) / CREDIT_VALUE_USD));
}

/** Calculate exact credits from real token counts after a session */
export function calculateActualCredits(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = getModelRate(model);
  const costUSD = (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  return usdToCredits(costUSD, model);
}

/** Rough token estimate from character count (4 chars ≈ 1 token) */
export function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export type ResponseMode = "concise" | "balanced" | "thorough";

export interface SessionEstimateConfig {
  litigantCount: number;
  maxIterations: number;
  responseMode: ResponseMode;
  model?: string;
}

/**
 * Estimate credit cost BEFORE a session runs (used for pre-reservation).
 * Conservative — always estimates slightly high so the reservation covers the full run.
 */
export function estimateSessionCredits(config: SessionEstimateConfig): number {
  const outputTokensPerTurn: Record<ResponseMode, number> = {
    concise: 300,
    balanced: 600,
    thorough: 1200,
  };

  const tokensPerTurn = outputTokensPerTurn[config.responseMode];
  const rounds = config.maxIterations;
  const litigants = Math.min(config.litigantCount, 4);

  // Output tokens: orchestrator + all role turns + verdict
  const outputTokens = 400 + litigants * rounds * tokensPerTurn + 1600;

  // Input tokens grow each round as the transcript accumulates.
  // Estimate: base system prompt (~600) + growing history.
  // Average input per turn escalates ~50% per round.
  const baseInput = 600;
  const historyPerRound = tokensPerTurn * litigants * 0.8;
  const avgInputPerTurn = baseInput + historyPerRound * (rounds / 2);
  const inputTokens = litigants * rounds * avgInputPerTurn + 8000; // 8k for verdict

  const model = config.model ?? "gpt-4o";
  return calculateActualCredits(model, Math.ceil(inputTokens), outputTokens);
}

/**
 * Snapshot of credit info for a model — sent to the frontend so it can
 * compute live estimates without a round-trip per slider change.
 */
export interface ModelCreditInfo {
  model: string;
  multiplier: number;
  inputRatePer1k: number;
  outputRatePer1k: number;
  creditValueUsd: number;
  /** Pre-computed example: default session (3 litigants, 2 rounds, balanced) */
  exampleSessionCredits: number;
}

export function getModelCreditInfo(model: string): ModelCreditInfo {
  const rate = getModelRate(model);
  return {
    model,
    multiplier: getModelMultiplier(model),
    inputRatePer1k: rate.input,
    outputRatePer1k: rate.output,
    creditValueUsd: CREDIT_VALUE_USD,
    exampleSessionCredits: estimateSessionCredits({
      litigantCount: 3,
      maxIterations: 2,
      responseMode: "balanced",
      model,
    }),
  };
}
