import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

function createAnthropicClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("Anthropic not configured — set ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export class AnthropicProvider implements AIProvider {
  readonly name: ProviderName = "anthropic";
  readonly displayName = "Anthropic";
  private model: string;

  constructor(model = "claude-opus-4-5") {
    this.model = model;
  }

  async *streamChat(
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const client = createAnthropicClient();

    // Anthropic separates the system message from the conversation
    const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Anthropic requires the first message to be from the user
    if (conversation.length === 0 || conversation[0].role !== "user") {
      conversation.unshift({ role: "user", content: "Begin." });
    }

    const stream = await client.messages.stream({
      model: this.model,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: conversation,
    });

    for await (const event of stream) {
      if (signal?.aborted) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}
