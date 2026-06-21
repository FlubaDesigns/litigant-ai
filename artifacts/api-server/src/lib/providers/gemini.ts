import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class GeminiProvider implements AIProvider {
  readonly name: ProviderName = "gemini";
  readonly displayName = "Google Gemini";
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(model = "gemini-2.5-pro", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini not configured — set GEMINI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey,
    });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    // include_usage is part of the OpenAI-compatible wire format Gemini's
    // endpoint speaks here — same flag OpenAIProvider sets. Without it the
    // brain engine fell back to estimating tokens from character count for
    // every Gemini session.
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
