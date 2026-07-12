export type ProviderName = "openai" | "anthropic" | "grok" | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
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

export const PROVIDER_MODELS: Record<ProviderName, { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-5",      label: "GPT-5" },
    { id: "gpt-4o",     label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "o3",         label: "o3 (reasoning)" },
    { id: "o4-mini",    label: "o4-mini (reasoning)" },
  ],
  anthropic: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  grok: [
    { id: "grok-3", label: "Grok 3" },
    { id: "grok-3-mini", label: "Grok 3 Mini" },
    { id: "grok-2", label: "Grok 2" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
};
