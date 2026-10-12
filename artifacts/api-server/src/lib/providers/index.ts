export type { AIProvider, ChatMessage, ProviderConfig, ProviderName } from "./types.js";
export { DEFAULT_MODELS, PROVIDER_DISPLAY_NAMES, PROVIDER_MODELS, DEFAULT_QUALITY_SCORES } from "./types.js";
export { OpenAIProvider } from "./openai.js";
export { AnthropicProvider } from "./anthropic.js";
export { GrokProvider } from "./grok.js";
export { GeminiProvider } from "./gemini.js";
export { CustomProvider } from "./custom.js";

import type { ProviderName, AIProvider } from "./types.js";
import { DEFAULT_MODELS } from "./types.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GrokProvider } from "./grok.js";
import { GeminiProvider } from "./gemini.js";
import { CustomProvider } from "./custom.js";
import { getApiKey, getAllConfiguredProviders } from "../apiKeyStore.js";

/**
 * Async provider creation — reads the provider key from Fluba.
 * Supports both built-in and fully custom providers (OpenAI-compatible).
 */
export async function createProviderAsync(
  id: string,
  model?: string,
  labelHint?: string
): Promise<AIProvider> {
  const creds = await getApiKey(id);

  if (!creds) {
    throw new Error(
      `Provider "${id}" is not configured. Check its connection in Fluba Cortex.`
    );
  }

  const resolvedModel = model ?? DEFAULT_MODELS[id];
  if (!resolvedModel) throw new Error(`No model selected for provider ${id}`);

  switch (id) {
    case "openai":    return new OpenAIProvider(resolvedModel, creds);
    case "anthropic": return new AnthropicProvider(resolvedModel, creds);
    case "grok":      return new GrokProvider(resolvedModel, creds);
    case "gemini":    return new GeminiProvider(resolvedModel, creds);
    default:
      if (!creds.baseUrl) {
        throw new Error(
          `Custom provider "${id}" requires a Base URL (OpenAI-compatible endpoint). Update it in Admin → API Keys.`
        );
      }
      return new CustomProvider(id, labelHint ?? id, resolvedModel, {
        key: creds.key,
        baseUrl: creds.baseUrl,
      });
  }
}

/** Returns all configured provider IDs — checks Firestore + env vars */
export async function getConfiguredProvidersAsync(): Promise<string[]> {
  const all = await getAllConfiguredProviders();
  return all.filter(p => Object.hasOwn(DEFAULT_MODELS, p.id) || !!p.baseUrl).map(p => p.id);
}
