import { assertAiEnabled } from "../aiStudioConfig.js";
import { PROVIDER_BASE_URLS, completionFromFinishReason } from "./types.js";
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderCompletion, ProviderName, TokenUsageSnapshot } from "./types.js";

export class OpenAIProvider implements AIProvider {
  readonly name: ProviderName = "openai";
  readonly displayName = "OpenAI";
  readonly model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;
  private _lastCompletion: ProviderCompletion = { status: "incomplete", finishReason: null };

  constructor(model = "gpt-5", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    if (!credentials?.key) throw new Error("OpenAI requires a Fluba credential.");
    this.client = new OpenAI({apiKey:credentials.key,baseURL:PROVIDER_BASE_URLS.openai});
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

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages,
      },
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
          cacheWriteTokens: (chunk.usage.prompt_tokens_details as {cache_write_tokens?: number} | undefined)?.cache_write_tokens ?? 0,
        };
      }

      if (signal?.aborted) break;
      const content = choice?.delta?.content;
      if (content) yield content;
    }

    this._lastCompletion = completionFromFinishReason(this._lastCompletion.finishReason, !signal?.aborted);
  }
}
