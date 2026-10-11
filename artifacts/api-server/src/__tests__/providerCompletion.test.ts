import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openai: vi.fn(),
  anthropic: vi.fn(),
  assertAiEnabled: vi.fn(),
}));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: mocks.openai } }; } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { stream: mocks.anthropic }; } }));
vi.mock("../lib/aiStudioConfig.js", () => ({ assertAiEnabled: mocks.assertAiEnabled }));

import { OpenAIProvider } from "../lib/providers/openai.js";
import { AnthropicProvider } from "../lib/providers/anthropic.js";
import { GrokProvider } from "../lib/providers/grok.js";
import { GeminiProvider } from "../lib/providers/gemini.js";
import { CustomProvider } from "../lib/providers/custom.js";
import type { AIProvider } from "../lib/providers/types.js";

type CompletionProvider = AIProvider & Required<Pick<AIProvider, "getLastCompletion" | "getLastUsage">>;
const credentials = { key: "unit-test-placeholder" };
const usage = { inputTokens: 1000, outputTokens: 10, cachedInputTokens: 200 };

async function* events(items: unknown[]) {
  yield* items;
}

// The finish reason and final usage deliberately arrive in separate packets.
function compatibleEvents(reason: string | null, withUsage = true): unknown[] {
  return [
    { choices: [{ delta: { content: "Answer" }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: reason }] },
    ...(withUsage ? [{ choices: [], usage: {
      prompt_tokens: 1000,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 500 },
    } }] : []),
  ];
}

function anthropicEvents(reason: string | null, withUsage = true, withMessageStop = true): unknown[] {
  return [
    ...(withUsage ? [{ type: "message_start", message: { usage: {
      input_tokens: 300,
      output_tokens: 0,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 500,
      cache_creation: { ephemeral_1h_input_tokens: 100 },
    } } }] : []),
    { type: "content_block_delta", delta: { type: "text_delta", text: "Answer" } },
    { type: "message_delta", delta: { stop_reason: reason } },
    ...(withUsage ? [{ type: "message_delta", delta: { stop_reason: null }, usage: { output_tokens: 10 } }] : []),
    ...(withMessageStop ? [{ type: "message_stop" }] : []),
  ];
}

const adapters: {
  name: string;
  create: () => CompletionProvider;
  mock: typeof mocks.openai;
  normalReason: string;
  packets: (reason: string | null, withUsage?: boolean) => unknown[];
}[] = [
  { name: "OpenAI", create: () => new OpenAIProvider("test-model", credentials), mock: mocks.openai, normalReason: "stop", packets: compatibleEvents },
  { name: "Grok", create: () => new GrokProvider("test-model", credentials), mock: mocks.openai, normalReason: "stop", packets: compatibleEvents },
  { name: "Gemini", create: () => new GeminiProvider("test-model", credentials), mock: mocks.openai, normalReason: "stop", packets: compatibleEvents },
  { name: "Custom", create: () => new CustomProvider("custom", "Custom", "test-model", { ...credentials, baseUrl: "https://example.invalid/v1" }), mock: mocks.openai, normalReason: "stop", packets: compatibleEvents },
  { name: "Anthropic", create: () => new AnthropicProvider("test-model", credentials), mock: mocks.anthropic, normalReason: "end_turn", packets: anthropicEvents },
];

async function consume(provider: AIProvider, signal?: AbortSignal): Promise<string> {
  let text = "";
  for await (const chunk of provider.streamChat([{ role: "user", content: "Question" }], 100, signal)) text += chunk;
  return text;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertAiEnabled.mockResolvedValue(undefined);
});

describe.each(adapters)("$name completion integrity", (adapter) => {
  it("starts incomplete before any request", () => {
    expect(adapter.create().getLastCompletion()).toEqual({ status: "incomplete", finishReason: null });
  });

  it("completes only with the explicit normal reason and keeps separate final usage", async () => {
    adapter.mock.mockReturnValue(events(adapter.packets(adapter.normalReason)));
    const provider = adapter.create();
    expect(await consume(provider)).toBe("Answer");
    expect(provider.getLastCompletion()).toEqual({ status: "complete", finishReason: adapter.normalReason });
    expect(provider.getLastUsage()).toMatchObject(usage);
    if (adapter.name === "OpenAI") expect(provider.getLastUsage()).toMatchObject({ cacheWriteTokens: 500 });
    if (adapter.name === "Anthropic") {
      expect(provider.getLastUsage()).toMatchObject({ cacheWriteTokens: 500, cacheWrite1hTokens: 100, estimated: false });
    }
  });

  it("records normal completion even when the provider supplies no usage", async () => {
    adapter.mock.mockReturnValue(events(adapter.packets(adapter.normalReason, false)));
    const provider = adapter.create();
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "complete", finishReason: adapter.normalReason });
    expect(provider.getLastUsage()).toBeNull();
  });

  it.each(["length", "max_tokens"])("preserves %s as truncation without losing billable usage", async (reason) => {
    adapter.mock.mockReturnValue(events(adapter.packets(reason)));
    const provider = adapter.create();
    expect(await consume(provider)).toBe("Answer");
    expect(provider.getLastCompletion()).toEqual({ status: "truncated", finishReason: reason });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it.each(["content_filter", "refusal"])("preserves %s as blocked", async (reason) => {
    adapter.mock.mockReturnValue(events(adapter.packets(reason)));
    const provider = adapter.create();
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "blocked", finishReason: reason });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it.each(["tool_calls", "tool_use", "stop_sequence", "future_unknown_reason", ""])("does not treat %s as a complete document", async (reason) => {
    adapter.mock.mockReturnValue(events(adapter.packets(reason)));
    const provider = adapter.create();
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: reason });
  });

  it("does not infer completion from content or usage when the reason is missing", async () => {
    adapter.mock.mockReturnValue(events(adapter.packets(null)));
    const provider = adapter.create();
    expect(await consume(provider)).toBe("Answer");
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: null });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it("does not accept another API format's normal reason", async () => {
    const reason = adapter.normalReason === "stop" ? "end_turn" : "stop";
    adapter.mock.mockReturnValue(events(adapter.packets(reason)));
    const provider = adapter.create();
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: reason });
  });

  it("resets completion and usage for every subsequent stream", async () => {
    const provider = adapter.create();
    adapter.mock.mockReturnValueOnce(events(adapter.packets(adapter.normalReason)));
    await consume(provider);
    expect(provider.getLastCompletion().status).toBe("complete");
    adapter.mock.mockReturnValueOnce(events(adapter.packets(null, false)));
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: null });
    expect(provider.getLastUsage()).toBeNull();
  });

  it("resets state even when the power check rejects a later request", async () => {
    const provider = adapter.create();
    adapter.mock.mockReturnValueOnce(events(adapter.packets(adapter.normalReason)));
    await consume(provider);
    mocks.assertAiEnabled.mockRejectedValueOnce(new Error("AI disabled"));
    await expect(consume(provider)).rejects.toThrow("AI disabled");
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: null });
    expect(provider.getLastUsage()).toBeNull();
  });

  it("resets state when opening the next provider stream fails", async () => {
    const provider = adapter.create();
    adapter.mock.mockReturnValueOnce(events(adapter.packets(adapter.normalReason)));
    await consume(provider);
    adapter.mock.mockImplementation(() => { throw new Error("Provider unavailable"); });
    await expect(consume(provider)).rejects.toThrow("Provider unavailable");
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: null });
    expect(provider.getLastUsage()).toBeNull();
  });

  it("retains the raw reason and usage but never completes when iteration throws", async () => {
    adapter.mock.mockReturnValue((async function* () {
      yield* adapter.packets(adapter.normalReason);
      throw new Error("Connection interrupted");
    })());
    const provider = adapter.create();
    await expect(consume(provider)).rejects.toThrow("Connection interrupted");
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: adapter.normalReason });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it("never completes an aborted stream even after receiving the terminal events", async () => {
    const controller = new AbortController();
    adapter.mock.mockReturnValue((async function* () {
      yield* adapter.packets(adapter.normalReason);
      controller.abort();
    })());
    const provider = adapter.create();
    await consume(provider, controller.signal);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: adapter.normalReason });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it("never completes when the signal was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    adapter.mock.mockReturnValue(events(adapter.packets(adapter.normalReason)));
    const provider = adapter.create();
    expect(await consume(provider, controller.signal)).toBe("");
    expect(provider.getLastCompletion().status).toBe("incomplete");
  });

  it("keeps a normal reason provisional until the consumer finishes iteration", async () => {
    const finalContent = adapter.name === "Anthropic"
      ? { type: "content_block_delta", delta: { type: "text_delta", text: "Tail" } }
      : { choices: [{ delta: { content: "Tail" }, finish_reason: null }] };
    adapter.mock.mockReturnValue(events([...adapter.packets(adapter.normalReason), finalContent]));
    const provider = adapter.create();
    for await (const chunk of provider.streamChat([{ role: "user", content: "Question" }], 100)) {
      if (chunk === "Tail") break;
    }
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: adapter.normalReason });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it("never completes when the consumer closes the iterator early", async () => {
    adapter.mock.mockReturnValue(events(adapter.packets(adapter.normalReason)));
    const provider = adapter.create();
    for await (const _ of provider.streamChat([{ role: "user", content: "Question" }], 100)) break;
    expect(provider.getLastCompletion().status).toBe("incomplete");
  });
});

describe("Anthropic stream termination", () => {
  it("requires message_stop after end_turn", async () => {
    mocks.anthropic.mockReturnValue(events(anthropicEvents("end_turn", true, false)));
    const provider = new AnthropicProvider("test-model", credentials);
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: "end_turn" });
    expect(provider.getLastUsage()).toMatchObject(usage);
  });

  it("does not accept message_stop that precedes end_turn", async () => {
    mocks.anthropic.mockReturnValue(events([{ type: "message_stop" }, ...anthropicEvents("end_turn", true, false)]));
    const provider = new AnthropicProvider("test-model", credentials);
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: "end_turn" });
  });

  it("does not leak a prior request's message_stop into the next stream", async () => {
    const provider = new AnthropicProvider("test-model", credentials);
    mocks.anthropic.mockReturnValueOnce(events(anthropicEvents("end_turn")));
    await consume(provider);
    expect(provider.getLastCompletion().status).toBe("complete");
    mocks.anthropic.mockReturnValueOnce(events(anthropicEvents("end_turn", true, false)));
    await consume(provider);
    expect(provider.getLastCompletion()).toEqual({ status: "incomplete", finishReason: "end_turn" });
  });
});

it("preserves custom-provider completion and usage through the stream_options fallback", async () => {
  mocks.openai.mockRejectedValueOnce(new Error("Unsupported stream_options"));
  mocks.openai.mockReturnValueOnce(events(compatibleEvents("length")));
  const provider = new CustomProvider("custom", "Custom", "test-model", { ...credentials, baseUrl: "https://example.invalid/v1" });
  await consume(provider);
  expect(mocks.openai).toHaveBeenCalledTimes(2);
  expect(provider.getLastCompletion()).toEqual({ status: "truncated", finishReason: "length" });
  expect(provider.getLastUsage()).toMatchObject(usage);
});
