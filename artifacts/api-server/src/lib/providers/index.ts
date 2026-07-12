export type { AIProvider, ChatMessage, ProviderConfig, ProviderName } from "./types.js";
export { DEFAULT_MODELS, PROVIDER_DISPLAY_NAMES, PROVIDER_MODELS } from "./types.js";
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

/** Synchronous provider creation using only env vars — for internal/test use */
export function createProvider(name: ProviderName, model?: string): AIProvider {
  const m = model ?? DEFAULT_MODELS[name];
  switch (name) {
    case "openai":    return new OpenAIProvider(m);
    case "anthropic": return new AnthropicProvider(m);
    case "grok":      return new GrokProvider(m);
    case "gemini":    return new GeminiProvider(m);
  }
}

/**
 * Async provider creation — checks Firestore apiKeyStore first, then env vars.
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
      `Provider "${id}" is not configured. Add its API key in Admin → API Keys.`
    );
  }

  const resolvedModel = model ?? DEFAULT_MODELS[id as ProviderName] ?? "gpt-5";

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
  return all.map((p) => p.id);
}

/** Synchronous env-var-only check (for startup health, no Firestore) */
export function getConfiguredProviders(): ProviderName[] {
  const configured: ProviderName[] = [];
  const hasOpenAI =
    !!process.env["OPENAI_API_KEY"] ||
    (!!process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] &&
      !!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]);
  if (hasOpenAI)                       configured.push("openai");
  if (process.env["ANTHROPIC_API_KEY"]) configured.push("anthropic");
  if (process.env["XAI_API_KEY"])       configured.push("grok");
  if (process.env["GEMINI_API_KEY"])    configured.push("gemini");
  return configured;
}
