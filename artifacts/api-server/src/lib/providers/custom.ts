/**
 * CustomProvider — any OpenAI-compatible API endpoint.
 * Used for future providers added via Admin → API Keys.
 */
import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

export class CustomProvider implements AIProvider {
  readonly name: ProviderName = "openai"; // uses openai-compat wire format
  readonly displayName: string;
  private model: string;
  private client: OpenAI;

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
