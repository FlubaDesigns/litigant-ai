import {beforeEach,describe,it,expect,vi} from "vitest";
import express from "express";
import request from "supertest";
import {billingRecoveryDatabase} from "./billingRecoveryDatabase.js";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:vi.fn()}));
vi.mock("../lib/brainEngine.js",()=>({runBrainSession:vi.fn()}));
vi.mock("../lib/sessionPricing.js",()=>({prepareSession:vi.fn(async(config:any)=>({config,estimatedCredits:200,rates:{},enabledProviders:["openai"],limits:{overdraftLimit:25}})),priceCalls:()=>100,annotateCalls:(calls:any)=>calls}));
vi.mock("../lib/squareClient.js",()=>({isSquareConfigured:()=>false}));
vi.mock("../lib/emailService.js",()=>({isResendConfigured:vi.fn(()=>false),sendTrackedEmail:vi.fn(async(_uid,_kind,deliver)=>deliver("test-key")),sendLowCreditsEmail:vi.fn(),sendZeroCreditsEmail:vi.fn(),sendFirstSessionEmail:vi.fn(),sendSessionCompleteEmail:vi.fn()}));
vi.mock("../lib/rateLimiter.js",()=>({makeRateLimiter:()=> (_req:any,_res:any,next:any)=>next()}));
import {getFirestoreDb,verifyIdToken} from "../lib/firebaseAdmin.js";
import {runBrainSession} from "../lib/brainEngine.js";
import {isResendConfigured,sendLowCreditsEmail,sendZeroCreditsEmail,sendFirstSessionEmail,sendSessionCompleteEmail} from "../lib/emailService.js";
import {recoverCreditRuns,reserveCreditRun} from "../lib/creditRunSettlement.js";
import {addCredits} from "../lib/creditLedger.js";
import brainRouter from "../routes/brain.js";
const app=express().use(express.json()).use(brainRouter);
const config={model:"gpt-4",litigantCount:3,confidenceTarget:80,maxIterations:2,responseMode:"balanced",outputFormat:"report",maxCredits:500};
const call=(extra:object={})=>request(app).post("/run-brain").set("Authorization","Bearer local").send({question:"Private question",config,...extra});
const finish=(opts:any,extra:object={})=>({sessionId:opts.sessionId,model:"fixture-model",creditsUsed:100,confidence:85,finalAnswer:"Answer",debateNotes:"Notes",transcript:["**Litigant 1:** Partial evidence"],caveats:[],artifacts:"",turns:[{role:"litigant_1",round:1,content:"Partial evidence"}],fixedStageTokens:0,conscienceVersion:1,tokenUsage:{inputTokens:10,outputTokens:10,calls:[]},courtroomOutcome:{reason:"approved",confidenceAtExit:85,round:1},...extra} as any);
const events=(text:string)=>text.split("\n\n").filter(s=>s.startsWith("data: ")).map(s=>JSON.parse(s.slice(6)));
let db:ReturnType<typeof billingRecoveryDatabase>;
const runRecord=()=>Object.entries(db.store).find(([key])=>key.startsWith("credit_runs/"))!;
beforeEach(()=>{vi.clearAllMocks();vi.mocked(isResendConfigured).mockResolvedValue(false);vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("External calls forbidden");}));db=billingRecoveryDatabase({"users/u":{plan:"pro",creditBalance:500}});vi.mocked(getFirestoreDb).mockReturnValue(db as any);vi.mocked(verifyIdToken).mockResolvedValue({uid:"u",emailVerified:true} as any);vi.mocked(runBrainSession).mockImplementation(async opts=>finish(opts));});
describe("production brain route billing recovery",()=>{
 it("independent concurrent routes never hand out overlapping execution caps",async()=>{
  let entered!:()=>void,release!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  vi.mocked(runBrainSession).mockImplementation(async opts=>{entered();await gate;return finish(opts,{creditsUsed:500});});
  const first=call().then(r=>r);await ready;
  try {const second=await call();expect(second.status).toBe(402);expect(runBrainSession).toHaveBeenCalledTimes(1);expect(vi.mocked(runBrainSession).mock.calls[0][0].config.maxCredits).toBe(500);}
  finally {release();}
  await first;expect(db.store["users/u"].creditBalance).toBe(0);
 });
 it("reports held credits after repeated refund failure, then billing recovery settles exactly once",async()=>{
  db.failTransactionsWhen(writes=>writes.some(w=>w.data.type==="refund"));
  const response=await call(),done=events(response.text).at(-1);
  expect(done).toMatchObject({type:"done",creditsUsed:100,creditsDebited:500,creditsReserved:400,settlementStatus:"pending"});
  expect(db.store[`sessions/${done.sessionId}`]).toMatchObject({creditsUsed:100,creditsReserved:400,settlementStatus:"pending"});
  db.failTransactionsWhen();await Promise.all([recoverCreditRuns("u"),recoverCreditRuns("u")]);
  expect(db.store["users/u"].creditBalance).toBe(400);expect(db.store[`sessions/${done.sessionId}`]).toMatchObject({creditsDebited:100,creditsReserved:0,settlementStatus:"settled"});
 });
 it("retries a committed settlement whose acknowledgement was lost without double refund",async()=>{
  const transaction=db.runTransaction;let lost=false;
  db.runTransaction=async fn=>{const result=await transaction(fn);if(!lost&&runRecord()?.[1].state==="settled"){lost=true;throw new Error("Lost commit acknowledgement");}return result;};
  const done=events((await call()).text).at(-1);expect(done).toMatchObject({type:"done",creditsUsed:100,creditsDebited:100,settlementStatus:"settled"});
  expect(db.store["users/u"].creditBalance).toBe(400);expect(Object.values(db.store).filter(v=>v.type==="refund")).toHaveLength(1);
 });
 it("preserves a committed result when preparation acknowledgement is lost",async()=>{
  const transaction=db.runTransaction;let lost=false;
  db.runTransaction=async fn=>{const result=await transaction(fn);if(!lost&&runRecord()?.[1].resultStored){lost=true;throw new Error("Lost prepare acknowledgement");}return result;};
  await call();await recoverCreditRuns("u");const [,run]=runRecord();
  expect(db.store[`sessions/${run.sessionId}`]).toMatchObject({status:"complete",finalAnswer:"Answer",creditsUsed:100,creditsReserved:0,settlementStatus:"settled"});
  expect(db.store["users/u"].creditBalance).toBe(400);
 });
 it("writes failure financial state atomically even when recovery wins before the failure record",async()=>{
  vi.mocked(runBrainSession).mockImplementation(async()=>{const [,run]=runRecord();run.leaseUntil=0;await recoverCreditRuns("u");throw new Error("Worker lost result");});
  await call();const [,run]=runRecord();expect(db.store["users/u"].creditBalance).toBe(500);
  expect(db.store[`sessions/${run.sessionId}`]).toMatchObject({status:"error",creditsUsed:0,creditsDebited:0,creditsReserved:0,settlementStatus:"settled"});
 });
 it("recovers a failure write whose acknowledgement was lost without a stale pending session",async()=>{
  vi.mocked(runBrainSession).mockRejectedValue(new Error("Provider failed"));
  const transaction=db.runTransaction;let lost=false;
  db.runTransaction=async fn=>{const result=await transaction(fn);if(!lost&&runRecord()?.[1].state==="pending"){lost=true;throw new Error("Lost failure commit acknowledgement");}return result;};
  await call();await recoverCreditRuns("u");const [,run]=runRecord();
  expect(db.store["users/u"].creditBalance).toBe(500);expect(db.store[`sessions/${run.sessionId}`]).toMatchObject({creditsDebited:0,creditsReserved:0,settlementStatus:"settled"});
 });
 it.each(["free","pro"])("cancellation retains only permitted %s content and truthfully pending full refund",async plan=>{
  db.store["users/u"].plan=plan;db.failTransactionsWhen(writes=>writes.some(w=>w.data.type==="refund"));
  vi.mocked(runBrainSession).mockImplementation(async opts=>finish(opts,{cancelled:true,courtroomOutcome:{reason:"aborted"}}));
  const done=events((await call()).text).at(-1);expect(done).toMatchObject({status:"cancelled",creditsUsed:0,creditsDebited:500,creditsReserved:500,settlementStatus:"pending"});
  const saved=db.store[`sessions/${done.sessionId}`];expect(saved.memorySaved).toBe(plan==="pro");
  if(plan==="pro")expect(saved.transcriptLines).toEqual(["**Litigant 1:** Partial evidence"]);
  else{expect(saved.transcriptLines).toBeUndefined();expect(saved.transcript).toBeUndefined();expect(saved.question).toBeUndefined();}
  db.failTransactionsWhen();await recoverCreditRuns("u");expect(db.store["users/u"].creditBalance).toBe(500);
 });
 it("keeps actionable missing-info relay ahead of truncated final-delivery status",async()=>{
  vi.mocked(runBrainSession).mockImplementation(async opts=>finish(opts,{pauseReason:"output_incomplete",outputIncomplete:{role:"assistant",reason:"length"},relayQuestion:"Which jurisdiction?",courtroomOutcome:{reason:"output_incomplete"}}));
  const done=events((await call()).text).at(-1);expect(done).toMatchObject({status:"relay_needed",needsRelay:true,relayQuestion:"Which jurisdiction?"});
  expect(db.store[`sessions/${done.sessionId}`]).toMatchObject({status:"relay_needed",outputIncomplete:{role:"assistant",reason:"length"}});
 });
 it("requires an approved outcome for complete status",async()=>{
  vi.mocked(runBrainSession).mockImplementation(async opts=>finish(opts,{courtroomOutcome:undefined}));
  expect(events((await call()).text).at(-1).status).toBe("incomplete");
 });
 it("admin refund racing pending recovery cannot exceed the collected charge",async()=>{
  db.failTransactionsWhen(writes=>writes.some(w=>w.data.type==="refund"));await call();db.failTransactionsWhen();
  const charge=Object.entries(db.store).find(([key,v])=>key.startsWith("credit_transactions/")&&v.type==="usage")![0].split("/")[1];
  await Promise.all([recoverCreditRuns("u"),addCredits("u",100,"refund",{refundTransactionId:charge})]);
  expect(db.store["users/u"].creditBalance).toBe(500);await recoverCreditRuns("u");expect(db.store["users/u"].creditBalance).toBe(500);
 });
});

describe("notifications respect preferences and settled balances",()=>{
 it("nested completion opt-out overrides legacy true for both completion templates",async()=>{
  vi.mocked(isResendConfigured).mockResolvedValue(true);db.store["users/u"].notifySessionComplete=true;db.store["users/u"].notifications={sessionComplete:false};
  await call();expect(sendFirstSessionEmail).not.toHaveBeenCalled();expect(sendSessionCompleteEmail).not.toHaveBeenCalled();
 });
 it("an opt-out while the run is executing takes effect before delivery",async()=>{
  vi.mocked(isResendConfigured).mockResolvedValue(true);db.store["users/u"].notifications={sessionComplete:true};
  vi.mocked(runBrainSession).mockImplementation(async opts=>{db.store["users/u"].notifications.sessionComplete=false;return finish(opts);});
  await call();expect(sendFirstSessionEmail).not.toHaveBeenCalled();expect(sendSessionCompleteEmail).not.toHaveBeenCalled();
 });
 it("does not send shortage prompts while any other conversation holds credits",async()=>{
  vi.mocked(isResendConfigured).mockResolvedValue(true);
  vi.mocked(runBrainSession).mockImplementation(async opts=>{await reserveCreditRun("u",400,"other","other");return finish(opts,{creditsUsed:10});});
  await call({config:{...config,maxCredits:100}});expect(db.store["users/u"].creditBalance).toBe(90);
  expect(sendLowCreditsEmail).not.toHaveBeenCalled();expect(sendZeroCreditsEmail).not.toHaveBeenCalled();
 });
 it("still delivers opted-in saved completion email while its refund is pending",async()=>{
  vi.mocked(isResendConfigured).mockResolvedValue(true);db.store["users/u"].notifications={sessionComplete:true};
  db.failTransactionsWhen(writes=>writes.some(w=>w.data.type==="refund"));await call();
  expect(sendSessionCompleteEmail).toHaveBeenCalledOnce();expect(sendFirstSessionEmail).toHaveBeenCalledOnce();
  expect(sendLowCreditsEmail).not.toHaveBeenCalled();expect(sendZeroCreditsEmail).not.toHaveBeenCalled();
 });
 it("does not send zero-balance prompts from its own unreturned reservation",async()=>{
  vi.mocked(isResendConfigured).mockResolvedValue(true);db.failTransactionsWhen(writes=>writes.some(w=>w.data.type==="refund"));
  await call();expect(sendLowCreditsEmail).not.toHaveBeenCalled();expect(sendZeroCreditsEmail).not.toHaveBeenCalled();
 });
});
