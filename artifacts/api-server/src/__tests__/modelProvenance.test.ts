import {beforeEach,expect,it,vi} from "vitest";
import type {Response} from "express";
vi.mock("../lib/providers/index.js",()=>({createProviderAsync:vi.fn(),getConfiguredProvidersAsync:async()=>["openai","anthropic"]}));
vi.mock("../lib/conscienceConfig.js",()=>({getConscienceClause:async()=>({text:"",version:"test"})}));
vi.mock("../lib/seatBriefs.js",()=>({getAllSeatBriefs:async()=>({orchestrator:"",moderator:"",architect:"",builder:"",auditor:"",litigant:""})}));
vi.mock("../lib/creditEngine.js",()=>({estimateSessionCredits:()=>1,calculateActualCredits:()=>1,charsToTokens:(n:number)=>Math.ceil(n/4)}));
import {createProviderAsync} from "../lib/providers/index.js";
import {runBrainSession} from "../lib/brainEngine.js";
const config={litigantCount:1,confidenceTarget:70,maxIterations:1,responseMode:"concise" as const,outputFormat:"verdict" as const,outputPreferenceMode:"answer-only" as const,provider:"openai",model:"configured-primary"};
function response(){const events:any[]=[];return {events,res:{writableEnded:false,write:(data:string)=>{events.push(JSON.parse(data.slice(6)));return true;},flush:()=>{}} as unknown as Response};}
function provider(name:string,model:string,fail=false){return {name,model,streamChat:vi.fn(async function*(){if(fail){yield "Failed partial";throw Error("Unavailable");}yield "APPROVED\nCONFIDENCE: 95\nARTIFACT_NEEDED: no\nComplete output";}),getLastUsage:()=>({inputTokens:10,outputTokens:20}),getLastCompletion:()=>({status:"complete",finishReason:"stop"})};}
beforeEach(()=>vi.clearAllMocks());
it("attributes successful failover to the admin-configured backup and separates failed attempts",async()=>{
  const primary=provider("openai","configured-primary",true), backup=provider("anthropic","configured-backup");
  vi.mocked(createProviderAsync).mockImplementation(async name=>(name==="openai"?primary:backup) as any);
  const {res,events}=response();
  const result=await runBrainSession({question:"Q",config,res,enabledProviders:["openai","anthropic"],fallbackModels:{anthropic:"configured-backup"}});
  expect(createProviderAsync).toHaveBeenCalledWith("anthropic","configured-backup");
  expect(result).toMatchObject({provider:"anthropic",model:"configured-backup",modelProvenance:{configured:{provider:"openai",model:"configured-primary"},completed:[{provider:"anthropic",model:"configured-backup"}],attempted:[{provider:"openai",model:"configured-primary"},{provider:"anthropic",model:"configured-backup"}]}});
  expect(result.tokenUsage.calls?.[0].model).toBe("configured-primary");
  expect(events.find(e=>e.type==="done")).toMatchObject({provider:"anthropic",model:"configured-backup"});
});
it("reports mixed actual models when explicit seat choices complete on two providers",async()=>{
  const primary=provider("openai","configured-primary"), backup=provider("anthropic","own-seat");
  vi.mocked(createProviderAsync).mockImplementation(async name=>(name==="openai"?primary:backup) as any);
  const own={provider:"anthropic",model:"own-seat",useMasterSettings:false};
  const inherited={provider:"openai",model:"configured-primary"};
  const result=await runBrainSession({question:"Q",config:{...config,seatMap:{orchestrator:inherited,moderator:own,architect:inherited,builder:inherited,auditor:inherited,litigants:[inherited]}},res:response().res});
  expect(result.provider).toBe("mixed");
  expect(result.model).toBe("configured-primary + own-seat");
  expect(result.modelProvenance.completed).toHaveLength(2);
});
it("uses the current backup catalogue model for a carried-over forced provider",async()=>{
  vi.mocked(createProviderAsync).mockImplementation(async(name,model)=>provider(name,model!) as any);
  const result=await runBrainSession({question:"Q",config,res:response().res,forcedProvider:"anthropic",enabledProviders:["openai","anthropic"],fallbackModels:{anthropic:"newly-saved-backup"}});
  expect(createProviderAsync).toHaveBeenCalledWith("anthropic","newly-saved-backup");
  expect(createProviderAsync).not.toHaveBeenCalledWith("anthropic","configured-primary");
  expect(result.model).toBe("newly-saved-backup");
});
it("cannot select a provider disabled in the current admin catalogue",async()=>{
  await expect(runBrainSession({question:"Q",config,res:response().res,forcedProvider:"anthropic",enabledProviders:["openai"]})).rejects.toThrow(/disabled/);
  expect(createProviderAsync).not.toHaveBeenCalled();
});
it("does not invent a completed model when the cap prevents every call",async()=>{
  vi.mocked(createProviderAsync).mockResolvedValue(provider("openai","configured-primary") as any);
  const result=await runBrainSession({question:"Q",config:{...config,maxCredits:1},res:response().res,priceCalls:calls=>calls.length?2:0});
  expect(result).toMatchObject({provider:"none",model:"No completed model call",modelProvenance:{completed:[],attempted:[]}});
});
it("executes exactly the supported ten litigants and rejects more at the engine boundary",async()=>{
  vi.mocked(createProviderAsync).mockResolvedValue(provider("openai","configured-primary") as any);
  const result=await runBrainSession({question:"Q",config:{...config,litigantCount:10},res:response().res});
  expect(result.turns.filter(turn=>turn.round===1)).toHaveLength(10);
  await expect(runBrainSession({question:"Q",config:{...config,litigantCount:11},res:response().res})).rejects.toThrow(/between 1 and 10/);
});

it("merges known prior successes without treating legacy usage or labels as proof of completed work",async()=>{
  const {mergeModelProvenance}=await import("../lib/modelProvenance.js");
  const current={configured:{provider:"anthropic",model:"next"},completed:[{provider:"anthropic",model:"next"}],attempted:[{provider:"anthropic",model:"next"}]};
  expect(mergeModelProvenance(current,{completed:[{provider:"openai",model:"old"}],attempted:[{provider:"openai",model:"old"},{provider:"anthropic",model:"next"}]})).toMatchObject({provider:"mixed",model:"old + next",modelProvenance:{completed:[{provider:"openai",model:"old"},{provider:"anthropic",model:"next"}],attempted:[{provider:"openai",model:"old"},{provider:"anthropic",model:"next"}]}});
  expect(mergeModelProvenance(current,{model:"unproven",callUsage:[{provider:"openai",model:"failed"}]}).model).toBe("next");
  expect(mergeModelProvenance(current,{completed:[null,{provider:"bad"}]}).model).toBe("next");
});
