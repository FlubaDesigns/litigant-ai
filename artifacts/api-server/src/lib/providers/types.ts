export type { ProviderName } from "@workspace/api-zod/session";
import type { ProviderName } from "@workspace/api-zod/session";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  estimated?: boolean;
}

export interface AIProvider {
  readonly model?: string;
  name: ProviderName;
  displayName: string;
  streamChat(
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal
  ): AsyncIterable<string>;
  /** Returns real token counts from the most recent streamChat call, if available. */
  getLastUsage?(): TokenUsageSnapshot | null;
}

export interface ProviderConfig {
  provider: ProviderName;
  model?: string;
}

/** Shared endpoints for generation and authenticated connection checks. */
export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  grok: "https://api.x.ai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5",
  anthropic: "claude-haiku-4-5",
  grok: "grok-3",
  gemini: "gemini-2.5-pro",
};

export const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  grok: "xAI Grok",
  gemini: "Google Gemini",
};

export interface ModelPricing {
  sourceUrl?: string;
  verifiedAt?: string;
  note?: string;
  cachedInputPer1k?: number;
  longContext?: { threshold: number; input: number; output: number; cachedInput: number };
}
export interface ModelDefinition {
  id: string; label: string; qualityScore: number; inputRatePer1k: number;
  outputRatePer1k: number; multiplier: number; pricing?: ModelPricing; retired?: boolean;
}
/** Resolve one model's API rates and markup for every pricing consumer. */
export function resolveModelPrice(model: ModelDefinition, multiplier = model.multiplier) {
  return {input:model.inputRatePer1k, output:model.outputRatePer1k, multiplier,
    ...(model.pricing?.cachedInputPer1k !== undefined ? {cachedInput:model.pricing.cachedInputPer1k} : {}),
    ...(model.pricing?.longContext ? {longContext:model.pricing.longContext} : {}),
    ...(model.pricing?.verifiedAt ? {verifiedAt:model.pricing.verifiedAt} : {}),
  };
}
const verifiedAt = "2026-10-05";
const openaiPricing = (id: string, cachedInputPer1k: number): ModelPricing => ({sourceUrl:`https://developers.openai.com/api/docs/models/${id}`, verifiedAt, cachedInputPer1k});
const claudePricing = (cachedInputPer1k: number): ModelPricing => ({sourceUrl:"https://platform.claude.com/docs/en/about-claude/pricing", verifiedAt, cachedInputPer1k});
const googlePricing = (cachedInputPer1k: number): ModelPricing => ({sourceUrl:"https://ai.google.dev/gemini-api/docs/pricing", verifiedAt, cachedInputPer1k});
const legacyGrok: ModelPricing = {sourceUrl:"https://docs.x.ai/developers/models", note:"Legacy rate; current provider catalog does not list this model."};

export const PROVIDER_MODELS: Record<ProviderName, ModelDefinition[]> = {
  openai: [
    { id: "gpt-5",       label: "GPT-5",              qualityScore: 90, inputRatePer1k: 0.00125, outputRatePer1k: 0.0100, multiplier: 5, pricing: openaiPricing("gpt-5", 0.000125) },
    { id: "gpt-4o",      label: "GPT-4o",             qualityScore: 78, inputRatePer1k: 0.0025, outputRatePer1k: 0.0100, multiplier: 5, pricing: openaiPricing("gpt-4o", 0.00125) },
    { id: "gpt-4o-mini", label: "GPT-4o Mini",        qualityScore: 38, inputRatePer1k: 0.00015, outputRatePer1k: 0.0006, multiplier: 8, pricing: openaiPricing("gpt-4o-mini", 0.000075) },
    { id: "o3",          label: "o3 (reasoning)",      qualityScore: 96, inputRatePer1k: 0.0020, outputRatePer1k: 0.0080, multiplier: 4, pricing: openaiPricing("o3", 0.0005) },
    { id: "o4-mini",     label: "o4-mini (reasoning)", qualityScore: 68, inputRatePer1k: 0.0011, outputRatePer1k: 0.0044, multiplier: 6, pricing: openaiPricing("o4-mini", 0.000275) },
  ],
  anthropic: [
    { id: "claude-opus-4-5",   label: "Claude Opus 4.5",   qualityScore: 92, inputRatePer1k: 0.0050, outputRatePer1k: 0.0250, multiplier: 3, pricing: claudePricing(0.0005) },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", qualityScore: 80, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5, pricing: claudePricing(0.0003) },
    { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5",  qualityScore: 42, inputRatePer1k: 0.0010, outputRatePer1k: 0.0050, multiplier: 8, pricing: claudePricing(0.0001) },
  ],
  grok: [
    // Retired slug redirects to a different model: https://docs.x.ai/developers/migration/may-15-retirement
    { id: "grok-3", retired: true, label: "Grok 3",      qualityScore: 74, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5, pricing: legacyGrok },
    { id: "grok-3-mini", label: "Grok 3 Mini", qualityScore: 32, inputRatePer1k: 0.0003, outputRatePer1k: 0.0005, multiplier: 8, pricing: legacyGrok },
    { id: "grok-2",      label: "Grok 2",      qualityScore: 58, inputRatePer1k: 0.0020, outputRatePer1k: 0.0100, multiplier: 5, pricing: legacyGrok },
  ],
  gemini: [
    { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   qualityScore: 84, inputRatePer1k: 0.00125, outputRatePer1k: 0.0100, multiplier: 5, pricing: {...googlePricing(0.000125), longContext:{threshold:200000,input:0.0025,output:0.015,cachedInput:0.00025}} },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", qualityScore: 48, inputRatePer1k: 0.0003, outputRatePer1k: 0.0025, multiplier: 10, pricing: googlePricing(0.00003) },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", qualityScore: 28, inputRatePer1k: 0.00010, outputRatePer1k: 0.0004, multiplier: 10, pricing: {sourceUrl:"https://ai.google.dev/gemini-api/docs/pricing", note:"Legacy rate; current provider catalog does not list this model."} },
  ],
};

/**
 * Default quality scores extracted from PROVIDER_MODELS for easy lookup.
 * Admins can override these via Firestore (system_config/modelScores).
 */
export const DEFAULT_QUALITY_SCORES: Record<string, number> = Object.fromEntries(
  Object.values(PROVIDER_MODELS).flat().map((m) => [m.id, m.qualityScore])
);
