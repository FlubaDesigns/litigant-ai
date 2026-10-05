import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
vi.mock("../lib/apiKeyStore.js",()=>({getApiKey:vi.fn()}));
import {getApiKey} from "../lib/apiKeyStore.js";
import {getProviderAvailability} from "../lib/providerAvailability.js";
let sequence=0;
const fetchMock=vi.fn();
beforeEach(()=>{
  vi.mocked(getApiKey).mockResolvedValue({key:`test-credential-${++sequence}`});
  fetchMock.mockReset();
  vi.stubGlobal("fetch",fetchMock);
});
afterEach(()=>vi.unstubAllGlobals());
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

describe("authenticated model availability",()=>{
  it("uses the provider's list and excludes invented or missing IDs",async()=>{
    fetchMock.mockResolvedValue(json({data:[{id:"gpt-4o"}],object:"list"}));
    const result=await getProviderAvailability("openai",["gpt-4o","missing"],true);
    expect(result).toMatchObject({state:"connected",modelIds:["gpt-4o"]});
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.openai.com/v1/models");
  });
  it.each([[401,"key_rejected"],[403,"key_rejected"],[429,"rate_limited"],[503,"unavailable"]])("handles HTTP %i without leaking upstream text",async(status,state)=>{
    fetchMock.mockResolvedValue(json({error:{message:"sensitive diagnostic"}},Number(status)));
    const result=await getProviderAvailability("grok",["grok-2"],true);
    expect(result.state).toBe(state);
    expect(result.modelIds).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("uses the configured endpoint and normalizes Gemini's model prefix",async()=>{
    vi.mocked(getApiKey).mockResolvedValue({key:`test-credential-${++sequence}`,baseUrl:"https://configured.example/v1"});
    fetchMock.mockResolvedValue(json({data:[{id:"models/gemini-2.5-pro"}]}));
    expect((await getProviderAvailability("gemini",["gemini-2.5-pro"],true)).modelIds).toEqual(["gemini-2.5-pro"]);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://configured.example/v1/models");
  });
  it("resolves an Anthropic alias only when its canonical model is listed",async()=>{
    fetchMock.mockImplementation(async(url)=>String(url).includes("/models/claude")
      ? json({id:"claude-sonnet-4-5-20250929",type:"model"})
      : json({data:[{id:"claude-sonnet-4-5-20250929",type:"model"}],has_more:false}));
    const result=await getProviderAvailability("anthropic",["claude-sonnet-4-5"],true);
    expect(result.modelIds).toEqual(["claude-sonnet-4-5"]);
    expect(result.discoveredModels).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("retains new provider models for discovery without making them runnable",async()=>{
    fetchMock.mockResolvedValue(json({data:[{id:"gpt-4o",created:1},{id:"gpt-future",created:2}],object:"list"}));
    const result=await getProviderAvailability("openai",["gpt-4o"],true);
    expect(result.modelIds).toEqual(["gpt-4o"]);
    expect(result.discoveredModels).toEqual([{id:"gpt-future",label:"gpt-future",releasedAt:"1970-01-01T00:00:02.000Z"}]);
  });
  it("classifies authentication errors returned as HTTP 400 without exposing the message",async()=>{
    fetchMock.mockResolvedValue(json({error:{type:"invalid_request_error",message:"Invalid API key sensitive-value"}},400));
    const result=await getProviderAvailability("anthropic",[],true);
    expect(result.state).toBe("key_rejected");
    expect(JSON.stringify(result)).not.toContain("sensitive-value");
  });
  it("caches checks, refreshes on demand, and immediately rechecks changed credentials",async()=>{
    fetchMock.mockImplementation(async()=>json({data:[{id:"gpt-4o"}]}));
    await getProviderAvailability("openai",["gpt-4o"]);
    await getProviderAvailability("openai",["gpt-4o"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async()=>json({error:{message:"rejected"}},401));
    expect((await getProviderAvailability("openai",["gpt-4o"],true)).modelIds).toEqual([]);
    vi.mocked(getApiKey).mockResolvedValue({key:`test-credential-${++sequence}`});
    fetchMock.mockImplementation(async()=>json({data:[{id:"gpt-4o"}]}));
    expect((await getProviderAvailability("openai",["gpt-4o"])).state).toBe("connected");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("never substitutes saved models when offline or unconfigured",async()=>{
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await getProviderAvailability("openai",["gpt-4o"],true)).modelIds).toEqual([]);
    vi.mocked(getApiKey).mockResolvedValue(null);
    expect((await getProviderAvailability("openai",["gpt-4o"],true)).state).toBe("not_configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
