import type { ProviderName } from "@/data/templates";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";

export interface ProviderInfo {
  name: ProviderName;
  displayName: string;
  defaultModel: string;
  models: { id: string; label: string }[];
}

export interface ProvidersResponse {
  configured: ProviderName[];
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
    return { configured: ["openai"], providers: [] };
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
