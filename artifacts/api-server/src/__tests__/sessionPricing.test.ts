import {beforeEach, describe, expect, it, vi} from "vitest";
import {CourtConfigSchema, parseReviewScore, confidenceLabel} from "@workspace/api-zod/session";
import {TEMPLATES, normalizeTemplate} from "@workspace/api-zod/templates";
vi.mock("../lib/providerCatalog.js", () => ({getProviderCatalog: vi.fn()}));
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb: () => null}));
import {getProviderCatalog} from "../lib/providerCatalog.js";
import {getModelCreditInfo} from "../lib/creditEngine.js";
import {prepareSession, priceCalls, annotateCalls, callCostUSD} from "../lib/sessionPricing.js";

function catalog(multiplier = 5) {
  const model = (id: string, qualityScore: number) => ({id, label:id, qualityScore, price:{input:.0025,output:.01,multiplier}, creditInfo:getModelCreditInfo(id, {input:.0025,output:.01,multiplier})});
  return {providers:[
    {name:"openai",defaultModel:"gpt-4o",models:[model("gpt-4o",80),model("gpt-4o-mini",30)]},
    {name:"gemini",defaultModel:"gemini-2.5-flash",models:[model("gemini-2.5-flash",50)]},
  ]} as any;
}
beforeEach(() => {
  vi.mocked(getProviderCatalog).mockResolvedValue(catalog());
});
describe("shared session contract and pricing", () => {
  it("keeps every seat, intelligence setting and output preference through API validation", () => {
    const seat = {provider:"gemini",model:"gemini-2.5-flash",intelligenceLevel:50,useMasterSettings:false};
    const config = CourtConfigSchema.parse({outputPreferenceMode:"answer-only", intelligenceLevel:80,
      seatMap:{orchestrator:seat,moderator:seat,architect:seat,builder:seat,auditor:seat,litigants:[seat]}});
    expect(config.outputPreferenceMode).toBe("answer-only");
    expect(config.seatMap?.litigants[0]).toEqual(seat);
    expect(config.intelligenceLevel).toBe(80);
  });
  it("resolves global model/provider together and respects a seat's own intelligence", async () => {
    const own={provider:"openai",intelligenceLevel:30,useMasterSettings:false};
    const inherit={provider:"auto",useMasterSettings:true};
    const {config} = await prepareSession({intelligenceLevel:50, seatMap:{orchestrator:inherit,moderator:inherit,
      architect:inherit,builder:inherit,auditor:own,litigants:[own]}});
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-2.5-flash");
    expect(config.seatMap!.auditor.model).toBe("gpt-4o-mini");
    expect(config.seatMap!.moderator.model).toBe("gemini-2.5-flash");
  });
  it("rejects disabled models before reserving funds", async () => {
    await expect(prepareSession({provider:"openai",model:"disabled-model"})).rejects.toThrow(/disabled/);
  });
  it("uses live multipliers in both quotes and a per-call immutable settlement snapshot", async () => {
    const first=await prepareSession({provider:"openai",model:"gpt-4o",maxCredits:100000});
    vi.mocked(getProviderCatalog).mockResolvedValue(catalog(10));
    const second=await prepareSession({provider:"openai",model:"gpt-4o",maxCredits:100000});
    expect(second.estimatedCredits).toBeGreaterThanOrEqual(first.estimatedCredits*2-1);
    expect(second.estimatedCredits).toBeLessThanOrEqual(first.estimatedCredits*2);
    expect(first.rates["gpt-4o"].multiplier).toBe(5);
    const calls=[{provider:"openai",model:"a",inputTokens:1000,outputTokens:1000},
      {provider:"gemini",model:"b",inputTokens:2000,outputTokens:0}];
    expect(priceCalls(calls,{a:{input:.01,output:.02,multiplier:2},b:{input:.005,output:.01,multiplier:3}})).toBe(9);
    expect(priceCalls([],first.rates)).toBe(0);
    expect(() => priceCalls(calls,{})).toThrow(/Missing price/);
  });
  it("caps the reservation and yields complete canonical template data", async () => {
    expect((await prepareSession({maxCredits:1})).estimatedCredits).toBe(1);
    for(const template of TEMPLATES) expect(CourtConfigSchema.safeParse(normalizeTemplate({id:template.id})!.defaultConfig).success).toBe(true);
    const override=normalizeTemplate({id:TEMPLATES[0].id,defaultSettings:{litigantCount:4}})!;
    expect(override.defaultConfig.litigantCount).toBe(4);
    expect(Array.isArray(override.inputFields)).toBe(true);
  });
  it("labels absent review as unassessed and rejects out-of-range scores", () => {
    expect(parseReviewScore("APPROVED\nCONFIDENCE: 68\n## Assessment Basis\nMissing source.")).toBe(68);
    expect(parseReviewScore("APPROVED")).toBe(0);
    expect(parseReviewScore("CONFIDENCE: 101")).toBe(0);
    expect(confidenceLabel(0)).toBe("Not assessed");
  });
});

describe("master model inheritance", () => {
  it("ignores a stale saved model when the seat inherits the master", async () => {
    const stale={provider:"openai",model:"gpt-4o",useMasterSettings:true};
    const {config}=await prepareSession({provider:"gemini",model:"gemini-2.5-flash",seatMap:{orchestrator:stale,moderator:stale,architect:stale,builder:stale,auditor:stale,litigants:[stale]}});
    expect(config.seatMap!.orchestrator.model).toBe("gemini-2.5-flash");
    expect(config.seatMap!.litigants[0].provider).toBe("gemini");
  });
  it("supports per-seat Auto without pinning it to yesterday's provider", async () => {
    const auto={provider:"auto",useMasterSettings:false,intelligenceLevel:50};
    const {config}=await prepareSession({intelligenceLevel:80,seatMap:{orchestrator:auto,moderator:auto,architect:auto,builder:auto,auditor:auto,litigants:[auto]}});
    expect(config.model).toBe("gpt-4o");
    expect(config.seatMap!.auditor.model).toBe("gemini-2.5-flash");
  });
  it("rejects the old unsupported 25-round option", () => {
    expect(CourtConfigSchema.safeParse({maxIterations:25}).success).toBe(false);
    expect(CourtConfigSchema.safeParse({maxIterations:20}).success).toBe(true);
  });
});


describe("measured agent pricing", () => {
  it("prices cached input once and rounds only the combined user charge", () => {
    const rate={input:.002,output:.008,cachedInput:.0005,multiplier:4};
    const call={seat:"Auditor",provider:"openai",model:"o3",inputTokens:1000,cachedInputTokens:800,outputTokens:100};
    expect(callCostUSD(call,rate)).toBeCloseTo(.0016);
    expect(priceCalls([call,call],{o3:rate})).toBe(2);
  });
  it("uses the long-context tier on both input and output above the boundary", () => {
    const rate={input:.00125,output:.01,cachedInput:.000125,multiplier:5,longContext:{threshold:200000,input:.0025,output:.015,cachedInput:.00025}};
    const call={provider:"gemini",model:"gemini-2.5-pro",inputTokens:200000,outputTokens:1000};
    expect(callCostUSD(call,rate)).toBeCloseTo(.26);
    expect(callCostUSD({...call,inputTokens:200001},rate)).toBeCloseTo(.5150025);
  });
  it("freezes each call's cost and provenance without inventing historical seats", () => {
    const calls=[{provider:"openai",model:"a",seat:"Builder",usageSource:"provider" as const,inputTokens:1000,outputTokens:1000}];
    const rates={a:{input:.01,output:.02,multiplier:2,verifiedAt:"2026-10-05"}};
    const saved=annotateCalls(calls,rates);
    rates.a.input=1;
    expect(saved[0]).toMatchObject({seat:"Builder",costUSD:.03,rateVerifiedAt:"2026-10-05",usageSource:"provider"});
    expect(calls[0]).not.toHaveProperty("costUSD");
    expect(annotateCalls([{provider:"old",model:"a",inputTokens:0,outputTokens:0}],rates)[0].seat).toBeUndefined();
  });
});

it("uses verified Grok rates including the inclusive 200k long-context boundary",async()=>{
  const {PROVIDER_MODELS,resolveModelPrice}=await import("../lib/providers/types.js");
  const {tokenCostUSD}=await import("../lib/creditEngine.js");
  const rate=resolveModelPrice(PROVIDER_MODELS.grok.find(m=>m.id==="grok-4.7")!);
  expect(rate).toMatchObject({input:.002,output:.006,cachedInput:.0005,verifiedAt:"2026-10-05"});
  expect(tokenCostUSD(rate,1000,1000,200)).toBeCloseTo(.0077);
  expect(tokenCostUSD(rate,200000,1000)).toBeCloseTo(.812);
  expect(tokenCostUSD(rate,199999,1000)).toBeCloseTo(.405998);
});
