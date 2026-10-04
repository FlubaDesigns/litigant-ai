import type { ProviderName } from "@/data/templates";

import { API_BASE } from "@/lib/apiUrl";

export interface PlatformLimits {
  maxLitigants: number;
  overdraftLimit: number;
}

export async function getLimits(): Promise<PlatformLimits> {
  const res = await fetch(`${API_BASE}/limits`, {cache:"no-store"});
  if (!res.ok) throw new Error("Unable to load platform limits");
  const data = await res.json();
  return {maxLitigants:data.limits?.maxLitigants ?? 10, overdraftLimit:data.limits?.overdraftLimit ?? 500};
}

export interface ModelCreditInfo {
  model: string;
  multiplier: number;
  inputRatePer1k: number;
  outputRatePer1k: number;
  creditValueUsd: number;
  exampleSessionCredits: number;
  // Formula constants shipped from the server (creditEngine.ts is the source of truth).
  // The frontend uses these so it never needs its own hardcoded copies.
  fixedStagePrior: { input: number; output: number };
  historyFillRate: number;
  tokensPerTurnByMode: Record<"concise" | "balanced" | "thorough", number>;
  orchestratorOutputTokens: number;
  systemPromptInputTokens: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** 0–100 quality score used by the intelligence slider. Admin-configurable. */
  qualityScore: number;
  creditInfo: ModelCreditInfo;
}

/**
 * Resolve the best-matching { provider, model } for a given intelligence level (0–100).
 * When providerPreference is "auto", searches across all enabled providers.
 * Picks the model whose qualityScore is closest to the requested level.
 */
export { resolveModelByIntelligence } from "@workspace/api-zod/session";

export interface ProviderInfo {
  name: ProviderName;
  displayName: string;
  defaultModel: string;
  models: ModelInfo[];
}

export interface ProvidersResponse {
  configured: ProviderName[];
  creditValueUsd: number;
  providers: ProviderInfo[];
}

export async function getProviders(): Promise<ProvidersResponse> {
  const res = await fetch(`${API_BASE}/providers`, {cache:"no-store"});
  if (!res.ok) throw new Error("Unable to load providers");
  return res.json();
}

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  grok: "xAI Grok",
  gemini: "Google Gemini",
};

export const PROVIDER_ICONS: Record<ProviderName, string> = {
  openai: "🤖",
  anthropic: "🔮",
  grok: "⚡",
  gemini: "✨",
};

export type ResponseMode = "concise" | "balanced" | "thorough";

export interface CalibrationStats {
  fixedStage: { input: number; output: number };
  sessionCount: number;
  isCalibrated: boolean;
  minSessions: number;
}

/**
 * Fetches the user's personal calibration stats — averaged fixed-stage token
 * usage from their own session history.  Returns null on any error.
 */
export async function getCalibration(idToken: string): Promise<CalibrationStats | null> {
  try {
    const res = await fetch(`${API_BASE}/calibration`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<CalibrationStats>;
  } catch {
    return null;
  }
}
