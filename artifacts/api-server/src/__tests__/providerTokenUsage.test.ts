import {describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({openai:vi.fn(),anthropic:vi.fn()}));
vi.mock("openai",()=>({default:class {chat={completions:{create:mocks.openai}}}}));
vi.mock("@anthropic-ai/sdk",()=>({default:class {messages={stream:mocks.anthropic}}}));
import {OpenAIProvider} from "../lib/providers/openai.js";
import {AnthropicProvider} from "../lib/providers/anthropic.js";
async function* events(items:unknown[]) {yield* items;}
describe("provider-reported billable cache writes",()=>{
  it("keeps OpenAI writes as a subset of total input",async()=>{
    mocks.openai.mockReturnValue(events([{choices:[{delta:{content:"Answer"}}],usage:{prompt_tokens:1000,completion_tokens:10,prompt_tokens_details:{cached_tokens:200,cache_write_tokens:500}}}]));
    const p=new OpenAIProvider("gpt-6.1-sol",{key:"unit-test-placeholder"});
    for await(const _ of p.streamChat([{role:"user",content:"Question"}],100)) {}
    expect(p.getLastUsage()).toMatchObject({inputTokens:1000,outputTokens:10,cachedInputTokens:200,cacheWriteTokens:500});
  });
  it("adds Claude's disjoint input categories once and retains the one-hour write subset",async()=>{
    mocks.anthropic.mockReturnValue(events([
      {type:"message_start",message:{usage:{input_tokens:300,output_tokens:0,cache_read_input_tokens:200,cache_creation_input_tokens:500,cache_creation:{ephemeral_1h_input_tokens:100}}}},
      {type:"message_delta",usage:{output_tokens:10}},
    ]));
    const p=new AnthropicProvider("claude-opus-5-5",{key:"unit-test-placeholder"});
    for await(const _ of p.streamChat([{role:"user",content:"Question"}],100)) {}
    expect(p.getLastUsage()).toEqual({inputTokens:1000,outputTokens:10,cachedInputTokens:200,cacheWriteTokens:500,cacheWrite1hTokens:100,estimated:false});
  });
});
