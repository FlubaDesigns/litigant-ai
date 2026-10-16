import {afterEach, beforeEach, expect, it, vi} from "vitest";
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb: vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getConscienceClause} from "../lib/conscienceConfig.js";
import {getRunInstructions} from "../lib/runInstructions.js";
import {getAiStudioConfig} from "../lib/aiStudioConfig.js";
import {getBillingDefaults} from "../lib/billingDefaultsConfig.js";
import {getMultiplierOverrides} from "../lib/pricingConfig.js";
import {getTemplates} from "../lib/templateStore.js";
import {getAllCreditPacks, invalidateCreditPacksCache} from "../lib/creditPacksConfig.js";
import {getCalibratedFixedStageTokens} from "../lib/creditEngine.js";

beforeEach(() => {vi.clearAllMocks(); invalidateCreditPacksCache();});
afterEach(() => vi.useRealTimers());
it.each([
  getConscienceClause, getAiStudioConfig, getBillingDefaults, getMultiplierOverrides,
  getTemplates, getAllCreditPacks, getCalibratedFixedStageTokens,
])("reports an unavailable database instead of substituting configuration", async load => {
  vi.mocked(getFirestoreDb).mockReturnValue(null);
  await expect(load()).rejects.toMatchObject({status:503});
});
it("reads each new Canon and refuses to reuse a previous success after an outage", async () => {
  const get = vi.fn().mockResolvedValueOnce({exists:true,data:()=>({text:"Owner's exact policy",version:"one"})})
    .mockResolvedValueOnce({exists:true,data:()=>({text:"Updated policy",version:"two"})})
    .mockRejectedValue(new Error("Private database error"));
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({get})})} as any);
  expect(await getConscienceClause()).toEqual({text:"Owner's exact policy",version:"one"});
  expect(await getConscienceClause()).toEqual({text:"Updated policy",version:"two"});
  await expect(getConscienceClause()).rejects.toThrow("Saved Canon instructions could not be loaded");
});
it("bounds a stalled Canon read and provides a retryable error", async () => {
  vi.useFakeTimers();
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({get:()=>new Promise(()=>{})})})} as any);
  const result = expect(getConscienceClause()).rejects.toMatchObject({status:503});
  await vi.advanceTimersByTimeAsync(3000);
  await result;
});
it("does not replace saved seat instructions when their source fails", async () => {
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:(id:string)=>({get:async()=>{
    if(id==='conscience') return {exists:true,data:()=>({text:"Policy",version:"one"})};
    throw new Error("Private seat database error");
  }})})} as any);
  await expect(getRunInstructions(true)).rejects.toThrow("Saved seat instructions could not be loaded");
});

it("refuses invalid saved billing values instead of replacing them with defaults",async()=>{
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({signupBonusCredits:-1})})})})} as any);
  await expect(getBillingDefaults()).rejects.toMatchObject({status:503});
});
it("reports estimate-history read failure rather than substituting the prior",async()=>{
  const query:any={orderBy:()=>query,limit:()=>query,get:async()=>{throw new Error("Read failed");}};
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>query} as any);
  await expect(getCalibratedFixedStageTokens()).rejects.toThrow("Session estimate history could not be loaded");
});
