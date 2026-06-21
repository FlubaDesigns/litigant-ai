import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class GrokProvider implements AIProvider {
  readonly name: ProviderName = "grok";
  readonly displayName = "xAI Grok";
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(model = "grok-3", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["XAI_API_KEY"];
    if (!apiKey) throw new Error("Grok not configured — set XAI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? "https://api.x.ai/v1",
      apiKey,
    });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    // x.ai's API speaks the OpenAI wire format, including stream_options.
    // Without include_usage the brain engine fell back to estimating tokens
    // from character count for every Grok session.
    const stream = await this.client.chat.completions.create(
      { model: this.model, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, messages },
      { signal }
    );
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
