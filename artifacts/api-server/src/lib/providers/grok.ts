import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

export class GrokProvider implements AIProvider {
  readonly name: ProviderName = "grok";
  readonly displayName = "xAI Grok";
  private model: string;
  private client: OpenAI;

  constructor(model = "grok-3", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["XAI_API_KEY"];
    if (!apiKey) throw new Error("Grok not configured — set XAI_API_KEY or add key in Admin → API Keys");
    this.client = new OpenAI({
      baseURL: credentials?.baseUrl ?? "https://api.x.ai/v1",
      apiKey,
    });
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      { model: this.model, max_tokens: maxTokens, stream: true, messages },
      { signal }
    );
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
