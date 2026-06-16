import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatMessage, ProviderName } from "./types.js";

export class AnthropicProvider implements AIProvider {
  readonly name: ProviderName = "anthropic";
  readonly displayName = "Anthropic";
  private model: string;
  private client: Anthropic;

  constructor(model = "claude-opus-4-5", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("Anthropic not configured — set ANTHROPIC_API_KEY or add key in Admin → API Keys");
    this.client = new Anthropic({ apiKey });
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    if (conversation.length === 0 || conversation[0].role !== "user") {
      conversation.unshift({ role: "user", content: "Begin." });
    }
    const stream = await this.client.messages.stream({
      model: this.model, max_tokens: maxTokens, system: systemMsg, messages: conversation,
    });
    for await (const event of stream) {
      if (signal?.aborted) break;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }
}
