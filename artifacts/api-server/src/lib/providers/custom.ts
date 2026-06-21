/**
 * CustomProvider — any OpenAI-compatible API endpoint.
 * Used for future providers added via Admin → API Keys.
 */
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class CustomProvider implements AIProvider {
  readonly name: ProviderName = "openai"; // uses openai-compat wire format
  readonly displayName: string;
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(
    id: string,
    label: string,
    model: string,
    credentials: { key: string; baseUrl: string }
  ) {
    this.name = id as ProviderName;
    this.displayName = label;
    this.model = model;
    this.client = new OpenAI({ apiKey: credentials.key, baseURL: credentials.baseUrl });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    // Custom endpoints are arbitrary third-party OpenAI-compatible APIs —
    // we can't assume stream_options is supported. Try requesting usage;
    // if the endpoint rejects the unknown param, retry once without it.
    // Either way brainEngine.ts's char-count estimate still covers us if
    // chunk.usage never arrives.
    let stream;
    try {
      stream = await this.client.chat.completions.create(
        { model: this.model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, messages },
        { signal }
      );
    } catch {
      stream = await this.client.chat.completions.create(
        { model: this.model, max_tokens: maxTokens, stream: true, messages },
        { signal }
      );
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;

      if (chunk.usage) {
        this._lastUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}
