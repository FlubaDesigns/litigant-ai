import { AiDisabledError, ProviderFailureError, providerFailureKind } from "./providerErrors.js";
import type { CallUsage } from "./sessionPricing.js";
import { type EngineConfig as CourtConfig } from "@workspace/api-zod/session";
import type { Response } from "express";
import { createProviderAsync, getConfiguredProvidersAsync } from "./providers/index.js";
import type { AIProvider, ChatMessage } from "./providers/index.js";
import { charsToTokens } from "./creditEngine.js";
import type { TokenUsage } from "./brainTypes.js";

export function sendSSE(res: Response, event: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    // Flush immediately so SSE events reach the client without waiting for a buffer to fill.
    // Express compression middleware adds res.flush(); fall back to the raw socket drain.
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Session aborted by client");
}

export async function resolveProvider(config: CourtConfig, forcedProvider?: string, enabled?: string[], fallbackModels?: Record<string, string>): Promise<AIProvider> {
  const configured = enabled ?? await getConfiguredProvidersAsync();
  const requested = forcedProvider ?? config.provider;
  if (requested && !configured.includes(requested)) throw new Error(`Provider ${requested} is disabled or unavailable.`);
  const provider = requested ?? configured[0];
  if (!provider) throw new Error("No enabled AI provider is available. Check Admin → AI Studio and API Keys.");
  // A carried-over failover provider must use that provider's currently enabled model,
  // never the original provider's model or an unvalidated hardcoded default.
  const model = provider === config.provider ? config.model : fallbackModels?.[provider];
  return createProviderAsync(provider, model ?? fallbackModels?.[provider]);
}

export async function resolveSeatProvider(
  seatId: string,
  config: CourtConfig,
  globalProvider: AIProvider,
  configured: string[],
  litIndex?: number
): Promise<AIProvider> {
  const seatMap = (config as any).seatMap;
  if (!seatMap) return globalProvider;

  let assignment: { provider?: string; model?: string } | undefined;
  if (seatId === "litigant" && litIndex !== undefined) {
    assignment = seatMap.litigants?.[litIndex];
  } else {
    assignment = seatMap[seatId];
  }

  if (!assignment?.provider) return globalProvider;
  const pid = assignment.provider;
  if (!configured.includes(pid)) return globalProvider;

  try {
    return await createProviderAsync(pid, assignment.model);
  } catch {
    return globalProvider;
  }
}

export class CreditCapError extends Error {}

export class IncompleteOutputError extends Error {
  constructor(readonly role: string, readonly output: string, readonly reason: string) {
    super(`The ${role} output is incomplete (${reason}).`);
  }
}

export async function streamRole(
  provider: AIProvider,
  messages: ChatMessage[],
  maxTokens: number,
  onChunk: (text: string) => void,
  usage: TokenUsage,
  signal?: AbortSignal,
  seat?: string,
  onCallUsage?: (call: CallUsage) => void,
): Promise<string> {
  // Optimistic estimate for input (used only if provider doesn't return real counts)
  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const estimatedInput = charsToTokens(inputChars);

  let output = "";
  let failure: unknown;
  try {
    for await (const chunk of provider.streamChat(messages, maxTokens, signal)) {
      throwIfAborted(signal);
      output += chunk;
      onChunk(chunk);
    }
  } catch (error) { failure = error; }
  const realUsage = provider.getLastUsage?.();
  if (realUsage || output) {
    const inputTokens = realUsage?.inputTokens ?? estimatedInput;
    const outputTokens = realUsage?.estimated ? Math.max(realUsage.outputTokens, charsToTokens(output.length)) : realUsage?.outputTokens ?? charsToTokens(output.length);
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    const call: CallUsage = {provider:provider.name, model:provider.model ?? "gpt-5", inputTokens, outputTokens,
      ...(seat ? {seat} : {}), usageSource:realUsage && !realUsage.estimated ? "provider" : "estimated",
      ...(realUsage?.cachedInputTokens !== undefined ? {cachedInputTokens:realUsage.cachedInputTokens} : {}),
      ...(realUsage?.cacheWriteTokens !== undefined ? {cacheWriteTokens:realUsage.cacheWriteTokens} : {}),
      ...(realUsage?.cacheWrite1hTokens !== undefined ? {cacheWrite1hTokens:realUsage.cacheWrite1hTokens} : {}),
    };
    usage.calls?.push(call);
    onCallUsage?.(call);
  }
  if (signal?.aborted || (failure instanceof Error && failure.message === "Session aborted by client")) {
    throw new IncompleteOutputError(seat ?? "Court", output, "aborted");
  }
  if (failure instanceof AiDisabledError) throw failure;
  if (failure) throw new ProviderFailureError(providerFailureKind(failure));
  const completion = provider.getLastCompletion?.();
  if (completion && completion.status !== "complete") {
    throw new IncompleteOutputError(seat ?? "Court", output, completion.finishReason ?? "missing_completion_signal");
  }
  if (!output.trim()) throw new ProviderFailureError("empty_response");

  return output;
}
