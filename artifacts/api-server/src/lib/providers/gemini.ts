import { assertAiEnabled } from "../aiStudioConfig.js";
import { PROVIDER_BASE_URLS, completionFromFinishReason } from "./types.js";
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderCompletion, ProviderName, TokenUsageSnapshot } from "./types.js";

export class GeminiProvider implements AIProvider {
  readonly name: ProviderName = "gemini";
  readonly displayName = "Google Gemini";
  readonly model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;
  private _lastCompletion: ProviderCompletion = { status: "incomplete", finishReason: null };

  constructor(model = "gemini-2.5-pro", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key;
    if (!apiKey) throw new Error("Gemini not configured — check the Fluba Cortex connection");
    this.client = new OpenAI({
      baseURL: PROVIDER_BASE_URLS.gemini,
      apiKey,
    });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  getLastCompletion(): ProviderCompletion {
    return this._lastCompletion;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;
    this._lastCompletion = { status: "incomplete", finishReason: null };
    await assertAiEnabled();

    // include_usage is part of the OpenAI-compatible wire format Gemini's
    // endpoint speaks here — same flag OpenAIProvider sets. Without it the
    // brain engine fell back to estimating tokens from character count for
    // every Gemini session.
    const stream = await this.client.chat.completions.create(
      { model: this.model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, messages },
      { signal, maxRetries: 0 }
    );
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (typeof choice?.finish_reason === "string") {
        this._lastCompletion = completionFromFinishReason(choice.finish_reason, false);
      }

      if (chunk.usage) {
        this._lastUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }

      if (signal?.aborted) break;
      const content = choice?.delta?.content;
      if (content) yield content;
    }

    this._lastCompletion = completionFromFinishReason(this._lastCompletion.finishReason, !signal?.aborted);
  }
}
