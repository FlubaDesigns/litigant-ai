export type { ProviderName } from "@workspace/api-zod/session";
import type { ProviderName } from "@workspace/api-zod/session";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
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

export const PROVIDER_MODELS: Record<ProviderName, { id: string; label: string; qualityScore: number; inputRatePer1k: number; outputRatePer1k: number; multiplier: number }[]> = {
  openai: [
    { id: "gpt-5",       label: "GPT-5",              qualityScore: 90, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5 },
    { id: "gpt-4o",      label: "GPT-4o",             qualityScore: 78, inputRatePer1k: 0.0025, outputRatePer1k: 0.0100, multiplier: 5 },
    { id: "gpt-4o-mini", label: "GPT-4o Mini",        qualityScore: 38, inputRatePer1k: 0.00015, outputRatePer1k: 0.0006, multiplier: 8 },
    { id: "o3",          label: "o3 (reasoning)",      qualityScore: 96, inputRatePer1k: 0.0100, outputRatePer1k: 0.0400, multiplier: 4 },
    { id: "o4-mini",     label: "o4-mini (reasoning)", qualityScore: 68, inputRatePer1k: 0.0011, outputRatePer1k: 0.0044, multiplier: 6 },
  ],
  anthropic: [
    { id: "claude-opus-4-5",   label: "Claude Opus 4.5",   qualityScore: 92, inputRatePer1k: 0.0150, outputRatePer1k: 0.0750, multiplier: 3 },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", qualityScore: 80, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5 },
    { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5",  qualityScore: 42, inputRatePer1k: 0.0008, outputRatePer1k: 0.0040, multiplier: 8 },
  ],
  grok: [
    { id: "grok-3",      label: "Grok 3",      qualityScore: 74, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5 },
    { id: "grok-3-mini", label: "Grok 3 Mini", qualityScore: 32, inputRatePer1k: 0.0003, outputRatePer1k: 0.0005, multiplier: 8 },
    { id: "grok-2",      label: "Grok 2",      qualityScore: 58, inputRatePer1k: 0.0020, outputRatePer1k: 0.0100, multiplier: 5 },
  ],
  gemini: [
    { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   qualityScore: 84, inputRatePer1k: 0.00125, outputRatePer1k: 0.0100, multiplier: 5 },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", qualityScore: 48, inputRatePer1k: 0.00015, outputRatePer1k: 0.0006, multiplier: 10 },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", qualityScore: 28, inputRatePer1k: 0.00010, outputRatePer1k: 0.0004, multiplier: 10 },
  ],
};

/**
 * Default quality scores extracted from PROVIDER_MODELS for easy lookup.
 * Admins can override these via Firestore (system_config/modelScores).
 */
export const DEFAULT_QUALITY_SCORES: Record<string, number> = Object.fromEntries(
  Object.values(PROVIDER_MODELS).flat().map((m) => [m.id, m.qualityScore])
);
