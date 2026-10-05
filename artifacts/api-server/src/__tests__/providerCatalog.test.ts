import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("../lib/providers/index.js", async () => ({...await import("../lib/providers/types.js"), getConfiguredProvidersAsync:vi.fn()}));
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb:vi.fn()}));
import {getConfiguredProvidersAsync} from "../lib/providers/index.js";
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getProviderCatalog, getAiStudioModels, getAdminPricingTable, CustomProviderSchema, validateCustomProviders} from "../lib/providerCatalog.js";
import {prepareSession, priceCalls} from "../lib/sessionPricing.js";
import {creditsForTokens} from "../lib/creditEngine.js";
const custom = {id:"acme", label:"Acme", models:[{id:"acme/model",label:"Custom model",inputRatePer1k:.12,outputRatePer1k:.36,multiplier:3,qualityScore:95}]};
let docs: Record<string, any>;
beforeEach(() => {
  docs = {aiStudio:{customProviders:[structuredClone(custom)]}, modelScores:{updatedAt:{seconds:1}}, pricing:{multipliers:{"gpt-4o":9,"acme/model":7}}};
  vi.mocked(getConfiguredProvidersAsync).mockResolvedValue(["openai","acme"]);
  vi.mocked(getFirestoreDb).mockReturnValue({collection:() => ({
    doc:(id:string) => ({get:async () => ({exists:true,data:() => docs[id] ?? {}})}),
    orderBy:() => ({limit:() => ({get:async () => ({docs:[]})})}),
  })} as any);
});
describe("one provider and pricing catalog", () => {
  it("uses identical prices and examples in Admin, AI Studio, selection, quotes and settlement", async () => {
    const catalog = await getProviderCatalog();
    const studio = await getAiStudioModels();
    const pricing = await getAdminPricingTable();
    const selected = catalog.providers.find(p => p.name === "acme")!;
    expect(selected.displayName).toBe("Acme");
    expect(selected.defaultModel).toBe("acme/model");
    for (const provider of catalog.providers) for (const model of provider.models) {
      const admin = pricing.models.find(m => m.model === model.id)!;
      const ai = studio.models.find(m => m.id === model.id)!;
      const quote = await prepareSession({provider:provider.name, model:model.id, litigantCount:3,maxIterations:2,responseMode:"balanced",maxCredits:100000});
      expect(ai.multiplier).toBe(model.creditInfo.multiplier);
      expect(admin.effectiveMultiplier).toBe(ai.multiplier);
      expect(admin.exampleCredits).toBe(ai.exampleCredits);
      expect(quote.estimatedCredits).toBe(ai.exampleCredits);
      expect(quote.rates[model.id]).toMatchObject({input:ai.inputRatePer1k,output:ai.outputRatePer1k,multiplier:ai.multiplier});
      expect(priceCalls([{provider:provider.name,model:model.id,inputTokens:1000,outputTokens:2000}],quote.rates)).toBe(creditsForTokens(quote.rates[model.id]!,1000,2000));
    }
  });
  it("takes a new override immediately while retaining the old session snapshot", async () => {
    const first = await prepareSession({provider:"acme",model:"acme/model",maxCredits:100000});
    docs.pricing.multipliers["acme/model"] = 12;
    const second = await prepareSession({provider:"acme",model:"acme/model",maxCredits:100000});
    expect(first.rates["acme/model"].multiplier).toBe(7);
    expect(second.rates["acme/model"].multiplier).toBe(12);
    expect(second.estimatedCredits).toBeGreaterThan(first.estimatedCredits);
    delete docs.pricing.multipliers["acme/model"];
    expect((await getAdminPricingTable()).models.find(m => m.model === "acme/model")!.effectiveMultiplier).toBe(3);
  });
  it("applies custom quality scores to selection and prices pipeline-only runs", async () => {
    docs.modelScores["acme/model"] = 100;
    const quote = await prepareSession({intelligenceLevel:100,maxCredits:100000},true);
    expect(quote.config.provider).toBe("acme");
    expect(quote.config.model).toBe("acme/model");
    expect(quote.estimatedCredits).toBe(creditsForTokens(quote.rates["acme/model"],12500,4590));
    expect((await getAiStudioModels()).models.find(m => m.id === "acme/model")!.qualityScore).toBe(100);
  });
  it("excludes disabled or unconfigured entries and replaces disabled defaults for failover", async () => {
    docs.aiStudio.disabledModels = ["gpt-5"];
    docs.aiStudio.disabledProviders = ["acme"];
    const catalog = await getProviderCatalog();
    expect(catalog.configured).toEqual(["openai"]);
    expect(catalog.providers[0].defaultModel).toBe("gpt-4o");
    expect((await prepareSession({provider:"openai"})).fallbackModels.openai).toBe("gpt-4o");
    await expect(prepareSession({provider:"acme"})).rejects.toThrow(/disabled/);
    await expect(prepareSession({provider:"openai",model:"gpt-5"})).rejects.toThrow(/disabled/);
    docs.aiStudio.disabledProviders = [];
    vi.mocked(getConfiguredProvidersAsync).mockResolvedValue(["openai"]);
    expect((await getProviderCatalog()).configured).toEqual(["openai"]);
    expect((await getAiStudioModels()).models.find(m => m.id === "acme/model")!.available).toBe(false);
  });
  it("rejects ambiguous IDs and invalid custom prices before billing", async () => {
    expect(CustomProviderSchema.safeParse({...custom, id:"auto"}).success).toBe(false);
    expect(CustomProviderSchema.safeParse({...custom, models:[{...custom.models[0],inputRatePer1k:-1}]}).success).toBe(false);
    expect(() => validateCustomProviders([{...custom,id:"openai"}])).toThrow(/already exists/);
    expect(() => validateCustomProviders([{...custom,models:[{...custom.models[0],id:"gpt-5"}]}])).toThrow(/unique/);
    expect(() => validateCustomProviders([{...custom,models:[custom.models[0],custom.models[0]]}])).toThrow(/unique/);
    docs.aiStudio.customProviders.push({...custom,id:"other"});
    await expect(getProviderCatalog()).rejects.toThrow(/unique/);
  });
  it("fails closed when persisted configuration cannot be read", async () => {
    vi.mocked(getFirestoreDb).mockReturnValue({collection:() => ({doc:() => ({get:async () => {throw new Error("unavailable");}})})} as any);
    await expect(prepareSession({provider:"openai"})).rejects.toThrow(/unavailable/);
  });
});
