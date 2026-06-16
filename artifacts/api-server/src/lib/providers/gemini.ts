import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

function createGeminiClient(): OpenAI {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("Gemini not configured — set GEMINI_API_KEY");
  // Gemini exposes an OpenAI-compatible endpoint
  return new OpenAI({
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
  });
}

export class GeminiProvider implements AIProvider {
  readonly name: ProviderName = "gemini";
  readonly displayName = "Google Gemini";
  private model: string;

  constructor(model = "gemini-2.5-pro") {
    this.model = model;
  }

  async *streamChat(
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const client = createGeminiClient();
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
