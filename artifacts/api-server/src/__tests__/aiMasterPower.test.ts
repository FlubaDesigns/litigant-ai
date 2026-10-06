import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({openai:vi.fn(), anthropic:vi.fn()}));
vi.mock("openai", () => ({default:class {chat={completions:{create:mocks.openai}}}}));
vi.mock("@anthropic-ai/sdk", () => ({default:class {messages={stream:mocks.anthropic}}}));
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {OpenAIProvider} from "../lib/providers/openai.js";
import {AnthropicProvider} from "../lib/providers/anthropic.js";
import {GrokProvider} from "../lib/providers/grok.js";
import {GeminiProvider} from "../lib/providers/gemini.js";
import {CustomProvider} from "../lib/providers/custom.js";
import type {AIProvider} from "../lib/providers/types.js";
let aiEnabled:boolean, failRead:boolean;
async function* chunks() {yield {choices:[{delta:{content:"answer"}}]};}
async function consume(provider:AIProvider) {for await (const _ of provider.streamChat([{role:"user",content:"test"}],100)) {}}
beforeEach(() => {
  aiEnabled=true; failRead=false;
  vi.clearAllMocks();
  mocks.openai.mockImplementation(() => chunks());
  mocks.anthropic.mockImplementation(async function* () { yield {type:"content_block_delta",delta:{type:"text_delta",text:"answer"}}; });
  vi.mocked(getFirestoreDb).mockReturnValue({collection:() => ({doc:() => ({get:async () => {
    if (failRead) throw Error("configuration unavailable");
    return {data:() => ({aiEnabled})};
  }})})} as any);
});
const key={key:"unit-test-placeholder"};
const providers:[string,() => AIProvider][] = [
  ["OpenAI", () => new OpenAIProvider("gpt-5",key)],
  ["Claude", () => new AnthropicProvider("claude-haiku-4-5",key)],
  ["Grok", () => new GrokProvider("grok-4",key)],
  ["Gemini", () => new GeminiProvider("gemini-2.5-flash",key)],
  ["Custom", () => new CustomProvider("acme","Acme","model",{...key,baseUrl:"https://example.test"})],
];
it.each(providers)("blocks %s with an already-created client, restores it on ON, and stops the next call", async (_name, make) => {
  const provider=make();
  aiEnabled=false;
  await expect(consume(provider)).rejects.toThrow("AI is switched off");
  expect(mocks.openai).not.toHaveBeenCalled(); expect(mocks.anthropic).not.toHaveBeenCalled();
  aiEnabled=true;
  await consume(provider);
  expect(mocks.openai.mock.calls.length+mocks.anthropic.mock.calls.length).toBe(1);
  aiEnabled=false;
  await expect(consume(provider)).rejects.toThrow("AI is switched off");
  expect(mocks.openai.mock.calls.length+mocks.anthropic.mock.calls.length).toBe(1);
});
it("blocks a custom endpoint retry if master power changes while the first request is pending", async () => {
  mocks.openai.mockImplementationOnce(() => {aiEnabled=false;throw Error("stream options rejected");});
  await expect(consume(providers[4][1]())).rejects.toThrow("AI is switched off");
  expect(mocks.openai).toHaveBeenCalledTimes(1);
});
it("never calls a provider when the master setting cannot be read", async () => {
  failRead=true;
  await expect(consume(providers[0][1]())).rejects.toThrow("configuration unavailable");
  expect(mocks.openai).not.toHaveBeenCalled();
});
