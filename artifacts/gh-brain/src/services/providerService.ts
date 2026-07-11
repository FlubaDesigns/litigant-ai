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
 * Estimate credit cost client-side.
 *
 * All formula constants come from creditInfo, which is shipped by the server
 * (creditEngine.ts is the single source of truth). No magic numbers here.
 */
export function estimateCredits(
  creditInfo: ModelCreditInfo,
  litigantCount: number,
  maxIterations: number,
  responseMode: ResponseMode
): number {
  const tokensPerTurn = creditInfo.tokensPerTurnByMode[responseMode];
  const litigants     = Math.min(litigantCount, 10);
  const rounds        = maxIterations;

  const historyPerRound = tokensPerTurn * litigants * creditInfo.historyFillRate;
  const avgInputPerTurn = creditInfo.systemPromptInputTokens + historyPerRound * (rounds / 2);

  const outputTokens = creditInfo.orchestratorOutputTokens
    + litigants * rounds * tokensPerTurn
    + creditInfo.fixedStagePrior.output;

  const inputTokens = litigants * rounds * avgInputPerTurn
    + creditInfo.fixedStagePrior.input;

  const costUSD =
    (inputTokens  / 1000) * creditInfo.inputRatePer1k +
    (outputTokens / 1000) * creditInfo.outputRatePer1k;

  return Math.max(1, Math.ceil((costUSD * creditInfo.multiplier) / creditInfo.creditValueUsd));
}
