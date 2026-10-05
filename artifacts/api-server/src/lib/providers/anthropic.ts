import { PROVIDER_BASE_URLS } from "./types.js";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatMessage, ProviderName, TokenUsageSnapshot } from "./types.js";

export class AnthropicProvider implements AIProvider {
  readonly name: ProviderName = "anthropic";
  readonly displayName = "Anthropic";
  readonly model: string;
  private client: Anthropic;
  private _lastUsage: TokenUsageSnapshot | null = null;

  constructor(model = "claude-haiku-4-5", credentials?: { key: string; baseUrl?: string }) {
    this.model = model;
    const apiKey = credentials?.key ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("Anthropic not configured — set ANTHROPIC_API_KEY or add key in Admin → API Keys");
    this.client = new Anthropic({ apiKey, baseURL: credentials?.baseUrl ?? PROVIDER_BASE_URLS.anthropic });
  }

  getLastUsage(): TokenUsageSnapshot | null {
    return this._lastUsage;
  }

  async *streamChat(messages: ChatMessage[], maxTokens: number, signal?: AbortSignal): AsyncIterable<string> {
    const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    if (conversation.length === 0 || conversation[0].role !== "user") {
      conversation.unshift({ role: "user", content: "Begin." });
    }

    this._lastUsage = null;
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: maxTokens,
        system: systemMsg,
        messages: conversation,
      },
      { signal }  // forwards AbortSignal into the SDK — cancels the HTTP request, not just the local loop
    );

    for await (const event of stream) {
      if (signal?.aborted) break;

      if (event.type === "message_start" && event.message?.usage) {
        const cachedInputTokens = event.message.usage.cache_read_input_tokens ?? 0;
        const cacheWriteTokens = event.message.usage.cache_creation_input_tokens ?? 0;
        const cacheWrite1hTokens = (event.message.usage as {cache_creation?: {ephemeral_1h_input_tokens?: number}}).cache_creation?.ephemeral_1h_input_tokens ?? 0;
        inputTokens = (event.message.usage.input_tokens ?? 0) + cachedInputTokens + cacheWriteTokens;
        outputTokens = event.message.usage.output_tokens ?? 0;
        this._lastUsage = {inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens, cacheWrite1hTokens, estimated:true};
      }
      if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens ?? 0;
        if (this._lastUsage) { this._lastUsage.outputTokens = outputTokens; this._lastUsage.estimated = false; }
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }

    // Keep null if no provider usage arrived; preserve partial usage on errors.
  }
}
