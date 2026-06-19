import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class OpenAIProvider implements AIProvider {
  readonly name: ProviderName = "openai";
  readonly displayName = "OpenAI";
  private model: string;
  private client: OpenAI;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(model = "gpt-4o", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    if (credentials) {
      this.client = new OpenAI({
        apiKey: credentials.key,
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      });
    } else {
      const directKey = process.env["OPENAI_API_KEY"];
      const replitBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
      const replitKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
      if (directKey) {
        this.client = new OpenAI({ apiKey: directKey });
      } else if (replitBase && replitKey) {
        this.client = new OpenAI({ baseURL: replitBase, apiKey: replitKey });
      } else {
        throw new Error("OpenAI not configured — set OPENAI_API_KEY or add key in Admin → API Keys");
      }
    }
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    this._lastUsage = null;

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages,
      },
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
