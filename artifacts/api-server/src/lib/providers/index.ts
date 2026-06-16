export type { AIProvider, ChatMessage, ProviderConfig, ProviderName } from "./types.js";
export { DEFAULT_MODELS, PROVIDER_DISPLAY_NAMES, PROVIDER_MODELS } from "./types.js";
export { OpenAIProvider } from "./openai.js";
export { AnthropicProvider } from "./anthropic.js";
export { GrokProvider } from "./grok.js";
export { GeminiProvider } from "./gemini.js";

import type { ProviderName, AIProvider } from "./types.js";
import { DEFAULT_MODELS } from "./types.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GrokProvider } from "./grok.js";
import { GeminiProvider } from "./gemini.js";

export function createProvider(name: ProviderName, model?: string): AIProvider {
  const m = model ?? DEFAULT_MODELS[name];
  switch (name) {
    case "openai":     return new OpenAIProvider(m);
    case "anthropic":  return new AnthropicProvider(m);
    case "grok":       return new GrokProvider(m);
    case "gemini":     return new GeminiProvider(m);
  }
}

/** Returns which providers are currently configured via env vars */
export function getConfiguredProviders(): ProviderName[] {
  const configured: ProviderName[] = [];

  const hasOpenAI =
    !!process.env["OPENAI_API_KEY"] ||
    (!!process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] &&
     !!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]);
  if (hasOpenAI) configured.push("openai");
  if (process.env["ANTHROPIC_API_KEY"]) configured.push("anthropic");
  if (process.env["XAI_API_KEY"])       configured.push("grok");
  if (process.env["GEMINI_API_KEY"])    configured.push("gemini");

  return configured;
}
