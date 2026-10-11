import {beforeEach, expect, it, vi} from "vitest";
import express from "express";
import request from "supertest";
import {billingRecoveryDatabase} from "./billingRecoveryDatabase.js";
import {CourtConfigSchema, applyLitigantLimit} from "@workspace/api-zod/session";
import {MAX_LITIGANTS, ADMIN_LIMIT_RANGES} from "@workspace/api-zod/limits";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:async()=>({uid:"admin",admin:true,email_verified:true})}));
vi.mock("../lib/brainEngine.js",()=>({runBrainSession:vi.fn()}));
vi.mock("../lib/providerCatalog.js",()=>({getProviderCatalog:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {runBrainSession} from "../lib/brainEngine.js";
import {getProviderCatalog} from "../lib/providerCatalog.js";
import {getModelCreditInfo} from "../lib/creditEngine.js";
import {getAdminLimits} from "../lib/adminLimitsConfig.js";
import {prepareSession} from "../lib/sessionPricing.js";
import adminRouter from "../routes/admin.js";
import brainRouter from "../routes/brain.js";
const app=express().use(express.json()).use(adminRouter).use(brainRouter);
let docs:Record<string,any>;
beforeEach(()=>{
  vi.mocked(runBrainSession).mockReset().mockRejectedValue(new Error("Offline fixture stops at AI boundary"));
  const db = billingRecoveryDatabase({"config/adminLimits":{maxLitigants:10,overdraftLimit:25}});
  docs = db.store;
  vi.mocked(getFirestoreDb).mockReturnValue(db as any);
  const price={input:.0025,output:.01,multiplier:5};
  vi.mocked(getProviderCatalog).mockResolvedValue({aiEnabled:true,providers:[{name:"openai",defaultModel:"gpt-4o",models:[{id:"gpt-4o",label:"Configured model",qualityScore:50,price,creditInfo:getModelCreditInfo("gpt-4o",price)}]}]} as any);
});
const save=(value:number)=>request(app).put("/admin/limits/maxLitigants").set("Authorization","Bearer admin").send({value});
it("keeps the existing ten-seat setting and shares one hard ceiling",async()=>{
  expect(MAX_LITIGANTS).toBe(10);
  expect(ADMIN_LIMIT_RANGES.maxLitigants.max).toBe(MAX_LITIGANTS);
  expect((await request(app).get("/limits")).body).toEqual({limits:{maxLitigants:10,overdraftLimit:25}});
  expect(CourtConfigSchema.safeParse({litigantCount:10}).success).toBe(true);
  expect(CourtConfigSchema.safeParse({litigantCount:11}).success).toBe(false);
  expect(docs["config/adminLimits"].maxLitigants).toBe(10);
});
it("saves, reloads and applies lower and restored admin limits to preparation and quote APIs",async()=>{
  for (const maximum of [2,7,10]) {
    expect((await save(maximum)).status).toBe(200);
    expect((await request(app).get("/limits")).body.limits.maxLitigants).toBe(maximum);
    expect((await getAdminLimits()).maxLitigants).toBe(maximum);
    const result=await prepareSession({litigantCount:10});
    expect(result.config.litigantCount).toBe(maximum);
    expect(result.config.seatMap?.litigants).toHaveLength(maximum);
    const quote=await request(app).post("/session-estimate").send({config:{litigantCount:10}});
    expect(quote.status).toBe(200);
    expect(quote.body.config.litigantCount).toBe(maximum);
  }
});
it("rejects unsupported direct writes/requests and oversized seat maps without changing owner data",async()=>{
  for(const value of [1,11,20,2.5]) expect((await save(value)).status).toBe(400);
  expect(docs["config/adminLimits"].maxLitigants).toBe(10);
  expect((await request(app).post("/session-estimate").send({config:{litigantCount:11}})).status).toBe(400);
  const seat={provider:"openai"};
  expect(CourtConfigSchema.safeParse({seatMap:{orchestrator:seat,moderator:seat,architect:seat,builder:seat,auditor:seat,litigants:Array(11).fill(seat)}}).success).toBe(false);
});
it("warns about legacy 11–20 settings, bounds execution, and never silently rewrites them",async()=>{
  docs["config/adminLimits"].maxLitigants=20;
  const response=await request(app).get("/limits");
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({limits:{maxLitigants:10},storedLimits:{maxLitigants:20}});
  expect(response.body.notices[0]).toMatch(/saved value has not been changed/);
  expect((await prepareSession({litigantCount:10})).config.litigantCount).toBe(10);
  expect(docs["config/adminLimits"].maxLitigants).toBe(20);
  expect((await save(8)).status).toBe(200);
  expect((await request(app).get("/limits")).body).toEqual({limits:{maxLitigants:8,overdraftLimit:25}});
});
it("limits editable UI configs with the same runtime cap and trims inactive seat assignments",()=>{
  const seat={provider:"openai"};
  const config=CourtConfigSchema.parse({litigantCount:10,seatMap:{orchestrator:seat,moderator:seat,architect:seat,builder:seat,auditor:seat,litigants:Array(10).fill(seat)}});
  const bounded=applyLitigantLimit(config,2);
  expect(bounded.litigantCount).toBe(2); expect(bounded.seatMap!.litigants).toHaveLength(2);
  expect(config.litigantCount).toBe(10);
  expect(applyLitigantLimit(bounded,2)).toBe(bounded);
});

it("applies saved changes at the real run API before execution, including administrator runs",async()=>{
  for(const maximum of [2,7,10]) {
    await save(maximum);
    const response=await request(app).post("/run-brain").set("Authorization","Bearer admin").send({question:"Offline limit test",config:{litigantCount:10}});
    expect(response.status).toBe(200);
    expect(vi.mocked(runBrainSession).mock.lastCall?.[0].config.litigantCount).toBe(maximum);
    expect(vi.mocked(runBrainSession).mock.lastCall?.[0].config.seatMap?.litigants).toHaveLength(maximum);
    expect(vi.mocked(runBrainSession).mock.lastCall?.[0].enabledProviders).toEqual(["openai"]);
  }
  const count=vi.mocked(runBrainSession).mock.calls.length;
  expect((await request(app).post("/run-brain").set("Authorization","Bearer admin").send({question:"Q",config:{litigantCount:11}})).status).toBe(400);
  expect(runBrainSession).toHaveBeenCalledTimes(count);
});
