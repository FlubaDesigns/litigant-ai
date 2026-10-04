import {beforeEach, describe, expect, it, vi} from "vitest";
import {CourtConfigSchema, parseReviewScore, confidenceLabel} from "@workspace/api-zod/session";
import {TEMPLATES, normalizeTemplate} from "@workspace/api-zod/templates";
vi.mock("../lib/providerCatalog.js", () => ({getProviderCatalog: vi.fn()}));
vi.mock("../lib/pricingConfig.js", () => ({getMultiplierOverrides: vi.fn()}));
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb: () => null}));
import {getProviderCatalog} from "../lib/providerCatalog.js";
import {getMultiplierOverrides} from "../lib/pricingConfig.js";
import {prepareSession, priceCalls} from "../lib/sessionPricing.js";

beforeEach(() => {
  vi.mocked(getProviderCatalog).mockResolvedValue({providers:[
    {name:"openai", defaultModel:"gpt-4o", models:[{id:"gpt-4o",label:"GPT",qualityScore:80},{id:"gpt-4o-mini",label:"Mini",qualityScore:30}]},
    {name:"gemini", defaultModel:"gemini-2.5-flash", models:[{id:"gemini-2.5-flash",label:"Flash",qualityScore:50}]},
  ]} as any);
  vi.mocked(getMultiplierOverrides).mockResolvedValue({"gpt-4o":5,"gpt-4o-mini":5,"gemini-2.5-flash":5});
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
    vi.mocked(getMultiplierOverrides).mockResolvedValue({"gpt-4o":10,"gpt-4o-mini":5,"gemini-2.5-flash":5});
    const second=await prepareSession({provider:"openai",model:"gpt-4o",maxCredits:100000});
    expect(second.estimatedCredits).toBe(first.estimatedCredits*2);
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
