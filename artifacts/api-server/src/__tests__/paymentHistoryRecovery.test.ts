import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { billingRecoveryDatabase } from "./billingRecoveryDatabase.js";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:vi.fn()}));
vi.mock("../lib/squareClient.js",()=>({isSquareConfigured:()=>true,createPaymentLink:vi.fn(),getSquareLocationId:()=>"location"}));
vi.mock("../lib/emailService.js",()=>({isResendConfigured:()=>false}));
import { getFirestoreDb, verifyIdToken } from "../lib/firebaseAdmin.js";
import { createPaymentLink } from "../lib/squareClient.js";
import { getTransactions, addCredits, grantSignupBonus } from "../lib/creditLedger.js";
import { invalidateCreditPacksCache } from "../lib/creditPacksConfig.js";
import billingRouter from "../routes/billing.js";
const app=express().use(express.json()).use(billingRouter);
let db:ReturnType<typeof billingRecoveryDatabase>;
const history=(query="")=>request(app).get(`/billing/payment-history${query}`).set("Authorization","Bearer fixture");
beforeEach(()=>{
 vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("External requests forbidden");}));
 db=billingRecoveryDatabase({"users/u":{plan:"free",creditBalance:0}});vi.mocked(getFirestoreDb).mockReturnValue(db as any);
 vi.mocked(verifyIdToken).mockResolvedValue({uid:"u",emailVerified:true} as any);invalidateCreditPacksCache();
});
describe("actual paid amount and purchase pagination",()=>{
 it("stores verified money alongside credit units and never infers historical money",async()=>{
  await addCredits("u",2200,"purchase",{paymentId:"paid",source:"square_checkout",idempotencyKey:"paid",paidAmountMinor:1999,paidCurrency:"USD"});
  const recent=Object.entries(db.store).find(([key])=>key.startsWith("credit_transactions/"))!;
  expect(recent[1]).toMatchObject({amount:2200,paidAmountMinor:1999,paidCurrency:"USD"});
  db.store[recent[0]].createdAt="2026-10-10T00:00:00Z";
  db.store["credit_transactions/legacy"]={userId:"u",type:"purchase",amount:4200,createdAt:"2026-01-01T00:00:00Z"};
  const result=await history();expect(result.status).toBe(200);
  expect(result.body.data).toEqual([expect.objectContaining({amount:1999,currency:"USD",description:"2200 credits",amountKnown:true}),expect.objectContaining({amount:null,currency:null,description:"4200 credits",amountKnown:false})]);
 });
 it("paginates purchases independently of any number of newer usage entries",async()=>{
  for(let i=0;i<75;i++)db.store[`credit_transactions/use${i}`]={userId:"u",type:"usage",amount:-1,createdAt:`2026-10-11T00:00:${String(i%60).padStart(2,"0")}Z`};
  for(let i=0;i<3;i++)db.store[`credit_transactions/pay${i}`]={userId:"u",type:"purchase",amount:100,paidAmountMinor:100,paidCurrency:"USD",createdAt:`2026-10-0${i+1}T00:00:00Z`};
  const ids:string[]=[];let cursor="";
  do{const page=await history(`?limit=1${cursor?`&cursor=${cursor}`:""}`);expect(page.status).toBe(200);ids.push(...page.body.data.map((p:any)=>p.id));cursor=page.body.nextCursor;}while(cursor);
  expect(ids).toEqual(["pay2","pay1","pay0"]);
 });
 it("rejects a different user's cursor and surfaces missing-index/storage failure",async()=>{
  db.store["credit_transactions/other"]={userId:"other",type:"purchase",createdAt:"2026-01-01"};
  expect((await history("?cursor=other")).status).toBe(400);
  const collection=db.collection;db.collection=(name:string)=>name==="credit_transactions"?{where:()=>{throw new Error("Index not ready");}}:collection(name);
  expect((await history()).status).toBe(503);
 });
 it("preserves non-USD money metadata rather than forcing USD",async()=>{
  db.store["credit_transactions/jpy"]={userId:"u",type:"purchase",amount:300,paidAmountMinor:1500,paidCurrency:"JPY",createdAt:"2026-01-01"};
  expect((await getTransactions("u",20,undefined,"purchase")).items[0]).toMatchObject({paidAmountMinor:1500,paidCurrency:"JPY"});
 });
});
describe("inactive offers and canonical signup eligibility",()=>{
 it.each(["pack","price"])("rejects a new checkout for inactive %s",async inactive=>{
  db.store["config/creditPacks"]={packs:{hidden:{id:"hidden",active:inactive!=="pack",name:"Hidden",description:"",metadata:{creditAmount:"500"},prices:[{id:"hidden-price",active:inactive!=="price",unit_amount:499,currency:"usd",metadata:{creditAmount:"500"}}]}}};
  expect((await request(app).post("/billing/checkout").set("Authorization","Bearer fixture").send({priceId:"hidden-price"})).status).toBe(404);
  expect(createPaymentLink).not.toHaveBeenCalled();
 });
 it.each([false,undefined])("does not grant to unverified or missing verification (%s)",async emailVerified=>{
  vi.mocked(verifyIdToken).mockResolvedValue({uid:"u",emailVerified} as any);
  expect((await request(app).post("/billing/signup-grant").set("Authorization","Bearer fixture")).status).toBe(403);
  expect(await grantSignupBonus("u",{emailVerified})).toEqual({skipped:true,amount:0});expect(db.store["users/u"].creditBalance).toBe(0);
 });
 it("honors admin-configured zero and changed bonus, with one grant across both callers",async()=>{
  db.store["config/billingDefaults"]={signupBonusCredits:0};expect(await grantSignupBonus("u",{emailVerified:true})).toEqual({skipped:false,amount:0});
  db.store["config/billingDefaults"].signupBonusCredits=123;
  expect(await grantSignupBonus("u",{emailVerified:true})).toEqual({skipped:true,amount:123});
  db.store["users/new"]={plan:"free",creditBalance:0};vi.mocked(verifyIdToken).mockResolvedValue({uid:"new",emailVerified:true} as any);
  await Promise.all([grantSignupBonus("new",{emailVerified:true}),request(app).post("/billing/signup-grant").set("Authorization","Bearer fixture")]);
  expect(db.store["users/new"].creditBalance).toBe(123);expect(db.store["users/u"].creditBalance).toBe(0);
  expect(Object.keys(db.store).filter(key=>key.startsWith("credit_transactions/") && db.store[key].userId === "new")).toHaveLength(1);
 });
});
