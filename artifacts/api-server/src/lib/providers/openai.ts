import OpenAI from "openai";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

function createOpenAIClient(): OpenAI {
  const directKey = process.env["OPENAI_API_KEY"];
  const replitBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const replitKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

  if (directKey) {
    return new OpenAI({ apiKey: directKey });
  }
  if (replitBase && replitKey) {
    return new OpenAI({ baseURL: replitBase, apiKey: replitKey });
  }
  throw new Error("OpenAI not configured — set OPENAI_API_KEY");
}

export class OpenAIProvider implements AIProvider {
  readonly name: ProviderName = "openai";
  readonly displayName = "OpenAI";
  private model: string;

  constructor(model = "gpt-4o") {
    this.model = model;
  }

  async *streamChat(
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const client = createOpenAIClient();
    const stream = await client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: maxTokens,
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
