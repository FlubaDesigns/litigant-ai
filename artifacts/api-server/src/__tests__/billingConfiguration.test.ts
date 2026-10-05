import {beforeEach,expect,it,vi} from "vitest";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:async()=>({uid:"admin",admin:true,email_verified:true})}));
vi.mock("../lib/emailTemplateStore.js", async original => ({...await original<typeof import("../lib/emailTemplateStore.js")>(),getTemplateConfig:async()=>({enabled:true,introText:"Your signup bonus is {bonusCredits} credits."})}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getAdminLimits} from "../lib/adminLimitsConfig.js";
import adminRouter from "../routes/admin.js";
import billingRouter from "../routes/billing.js";
import brainRouter from "../routes/brain.js";
const app=express().use(express.json()).use(adminRouter).use(billingRouter).use(brainRouter);
let docs:Record<string,any>, fail:boolean;
beforeEach(()=>{
  fail=false;
  docs={"config/billingDefaults":{autoRefillAmounts:[10,20,50],defaultAutoRefillAmount:20,defaultThresholdCredits:100,defaultWarningThresholdCredits:200,signupBonusCredits:500,emailCreditWarningThreshold:100}};
  vi.mocked(getFirestoreDb).mockReturnValue({collection:(collection:string)=>({doc:(id:string)=>({
    get:async()=>{if(fail)throw Error("Read unavailable");const value=docs[`${collection}/${id}`];return {exists:!!value,data:()=>value};},
    set:async(value:any)=>{docs[`${collection}/${id}`]={...docs[`${collection}/${id}`],...value};},
  })})} as any);
});
const save=(body:any)=>request(app).put("/admin/billing-defaults").set("Authorization","Bearer test").send(body);
it("saves only the signup change and shares it with the public API and email preview",async()=>{
  const result=await save({signupBonusCredits:100});
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({signupBonusCredits:100,autoRefillAmounts:[10,20,50],defaultAutoRefillAmount:20});
  expect((await request(app).get("/billing/defaults")).body.signupBonusCredits).toBe(100);
  const preview=await request(app).get("/admin/email-templates/verification/preview").set("Authorization","Bearer test");
  expect(preview.status).toBe(200);
  expect(preview.text).toContain("Your signup bonus is 100 credits.");
  expect(preview.text).not.toContain("500 credits");
});
it("persists the email warning threshold and accepts zero",async()=>{
  expect((await save({emailCreditWarningThreshold:75})).body.emailCreditWarningThreshold).toBe(75);
  expect((await save({signupBonusCredits:0,emailCreditWarningThreshold:0})).body).toMatchObject({signupBonusCredits:0,emailCreditWarningThreshold:0});
});
it("rejects invalid amounts and inconsistent quick-picks without overwriting saved data",async()=>{
  for(const body of [{autoRefillAmounts:[]},{autoRefillAmounts:[10,50]},{signupBonusCredits:-1},{signupBonusCredits:1.5},{emailCreditWarningThreshold:100001}]) expect((await save(body)).status).toBe(400);
  expect(docs["config/billingDefaults"].signupBonusCredits).toBe(500);
  expect((await save({autoRefillAmounts:[10,50],defaultAutoRefillAmount:50})).status).toBe(200);
});
it("reads the same saved limits and never replaces an unreadable configuration with defaults",async()=>{
  docs["config/adminLimits"]={maxLitigants:2,overdraftLimit:100};
  expect(await getAdminLimits()).toEqual({maxLitigants:2,overdraftLimit:100});
  expect((await request(app).get("/limits")).body.limits).toEqual({maxLitigants:2,overdraftLimit:100});
  fail=true;
  await expect(getAdminLimits()).rejects.toThrow(/temporarily unavailable/);
  expect((await request(app).get("/limits")).status).toBe(503);
});
it("uses installation defaults only for absent limits and rejects corrupt settings",async()=>{
  expect(await getAdminLimits()).toEqual({maxLitigants:10,overdraftLimit:25});
  docs["config/adminLimits"]={maxLitigants:99};
  await expect(getAdminLimits()).rejects.toThrow(/temporarily unavailable/);
});

it("returns 503 for a quote when limits cannot be read",async()=>{
  fail=true;
  const result=await request(app).post("/session-estimate").send({config:{litigantCount:10}});
  expect(result.status).toBe(503);
  expect(result.body.message).toMatch(/Platform limits are temporarily unavailable/);
});
