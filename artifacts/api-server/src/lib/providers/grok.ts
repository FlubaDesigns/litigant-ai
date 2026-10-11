import { assertAiEnabled } from "../aiStudioConfig.js";
import { PROVIDER_BASE_URLS, DEFAULT_MODELS, completionFromFinishReason } from "./types.js";
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderCompletion, ProviderName, TokenUsageSnapshot } from "./types.js";

export class GrokProvider implements AIProvider {
  readonly name: ProviderName = "grok";
  readonly displayName = "xAI Grok";
  readonly model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;
  private _lastCompletion: ProviderCompletion = { status: "incomplete", finishReason: null };

  constructor(model = DEFAULT_MODELS.grok, credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["XAI_API_KEY"];
    if (!apiKey) throw new Error("Grok not configured — set XAI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? PROVIDER_BASE_URLS.grok,
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

    // x.ai's API speaks the OpenAI wire format, including stream_options.
    // Without include_usage the brain engine fell back to estimating tokens
    // from character count for every Grok session.
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
