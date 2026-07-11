import type { ProviderName } from "@/data/templates";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";

export interface PlatformLimits {
  maxLitigants: number;
}

export async function getLimits(): Promise<PlatformLimits> {
  try {
    const res = await fetch(`${API_BASE}/limits`);
    if (!res.ok) return { maxLitigants: 10 };
    const data = await res.json();
    return { maxLitigants: data.limits?.maxLitigants ?? 10 };
  } catch {
    return { maxLitigants: 10 };
  }
}

export interface ModelCreditInfo {
  model: string;
  multiplier: number;
  inputRatePer1k: number;
  outputRatePer1k: number;
  creditValueUsd: number;
  exampleSessionCredits: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  creditInfo: ModelCreditInfo;
}

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

let _cache: ProvidersResponse | null = null;

export async function getProviders(): Promise<ProvidersResponse> {
  if (_cache) return _cache;
  try {
    const res = await fetch(`${API_BASE}/providers`);
    if (!res.ok) throw new Error("Failed to fetch providers");
    _cache = await res.json();
    return _cache!;
  } catch {
    return { configured: ["openai"], creditValueUsd: 0.01, providers: [] };
  }
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

/**
 * Estimate credit cost client-side using the same formula as the backend.
 * Requires creditInfo from the providers response.
 */
export function estimateCredits(
  creditInfo: ModelCreditInfo,
  litigantCount: number,
  maxIterations: number,
  responseMode: ResponseMode
): number {
  const tokensPerTurn = { concise: 300, balanced: 600, thorough: 1200 }[responseMode];
  const litigants = Math.min(litigantCount, 4);
  const rounds = maxIterations;

  // Output: orchestrator + litigant turns + fixed pipeline stages (85% fill of 5 400 cap = 4 590)
  // Fixed stages mirror FIXED_STAGE_PRIOR in api-server/src/lib/creditEngine.ts
  const outputTokens = 400 + litigants * rounds * tokensPerTurn + 4_590;

  // Input grows each round as history accumulates; fixed stages add 12 500 context tokens
  const historyPerRound = tokensPerTurn * litigants * 0.85;
  const avgInputPerTurn = 600 + historyPerRound * (rounds / 2);
  const inputTokens = litigants * rounds * avgInputPerTurn + 12_500;

  const costUSD =
    (inputTokens / 1000) * creditInfo.inputRatePer1k +
    (outputTokens / 1000) * creditInfo.outputRatePer1k;

  return Math.max(1, Math.ceil((costUSD * creditInfo.multiplier) / creditInfo.creditValueUsd));
}
