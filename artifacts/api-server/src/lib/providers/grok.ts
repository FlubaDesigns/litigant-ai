import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

function createGrokClient(): OpenAI {
  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) throw new Error("Grok not configured — set XAI_API_KEY");
  return new OpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey,
  });
}

export class GrokProvider implements AIProvider {
  readonly name: ProviderName = "grok";
  readonly displayName = "xAI Grok";
  private model: string;

  constructor(model = "grok-3") {
    this.model = model;
  }

  async *streamChat(
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const client = createGrokClient();
    const stream = await client.chat.completions.create(
      {
        model: this.model,
        max_tokens: maxTokens,
        stream: true,
        messages,
      },
      { signal }
    );
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
