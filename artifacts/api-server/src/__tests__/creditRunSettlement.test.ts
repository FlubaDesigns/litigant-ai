import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingRecoveryDatabase } from "./billingRecoveryDatabase.js";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true}));
vi.mock("../lib/billingDefaultsConfig.js",()=>({getBillingDefaults:vi.fn()}));
vi.mock("../lib/emailService.js",()=>({isResendConfigured:()=>false}));
import { getFirestoreDb } from "../lib/firebaseAdmin.js";
import { reserveCreditRun, prepareCreditRunSettlement, applyCreditRunSettlement, recoverCreditRuns } from "../lib/creditRunSettlement.js";
import { addCredits } from "../lib/creditLedger.js";
import { SESSION_RUN_LEASE_MS } from "../lib/sessionRunLock.js";
let db: ReturnType<typeof billingRecoveryDatabase>;
const ledger=()=>Object.values(db.store).filter((v:any)=>v.type==="usage"||v.type==="refund");
beforeEach(()=>{db=billingRecoveryDatabase({"users/u":{plan:"pro",creditBalance:500}});vi.mocked(getFirestoreDb).mockReturnValue(db as any);vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("External calls forbidden");}));});
describe("durable per-run credit lifecycle",()=>{
 it("does not authorize overlapping full allowances across concurrent conversations",async()=>{
  const accepted=await Promise.all([reserveCreditRun("u",500,"s1","r1"),reserveCreditRun("u",500,"s2","r2")]);
  expect(accepted.filter(Boolean)).toHaveLength(1);expect(db.store["users/u"].creditBalance).toBe(0);expect(ledger()).toHaveLength(1);
 });
 it("allows independent bounded budgets and preserves the one-account courtesy ceiling",async()=>{
  expect(await reserveCreditRun("u",300,"s1","r1",100)).toBe(true);
  expect(await reserveCreditRun("u",300,"s2","r2",100)).toBe(true);
  expect(await reserveCreditRun("u",1,"s3","r3",100)).toBe(false);
  expect(db.store["users/u"].creditBalance).toBe(-100);
 });
 it("reserving the same run twice never debits twice",async()=>{
  await Promise.all([reserveCreditRun("u",500,"s","r"),reserveCreditRun("u",500,"s","r")]);
  expect(db.store["users/u"].creditBalance).toBe(0);expect(ledger()).toHaveLength(1);
 });
 it("keeps failed refunds pending and honest, then repairs ledger and displayed amount exactly once",async()=>{
  await reserveCreditRun("u",500,"s","r");
  await prepareCreditRunSettlement("u","r",100,{userId:"u",status:"complete",transcript:"saved"});
  db.failTransactionsWhen(writes=>writes.some(w=>w.data.type==="refund"));
  await expect(applyCreditRunSettlement("u","r")).rejects.toThrow("Injected");
  await expect(applyCreditRunSettlement("u","r")).rejects.toThrow("Injected");
  expect(db.store["sessions/s"]).toMatchObject({creditsUsed:100,creditsDebited:500,creditsReserved:400,settlementStatus:"pending"});
  expect(db.store["users/u"].creditBalance).toBe(0);
  db.failTransactionsWhen();await Promise.all([recoverCreditRuns("u"),recoverCreditRuns("u")]);
  expect(db.store["users/u"].creditBalance).toBe(400);
  expect(db.store["sessions/s"]).toMatchObject({creditsUsed:100,creditsDebited:100,creditsReserved:0,settlementStatus:"settled"});
  expect(ledger().filter((v:any)=>v.type==="refund")).toHaveLength(1);
 });
 it("a stale error handler cannot replace a durable successful result's pending charge",async()=>{
  await reserveCreditRun("u",500,"s","r");await prepareCreditRunSettlement("u","r",100,{userId:"u",status:"complete"});
  expect(await prepareCreditRunSettlement("u","r",0)).toMatchObject({targetCharge:100,resultStored:true});
  await applyCreditRunSettlement("u","r");expect(db.store["users/u"].creditBalance).toBe(400);
 });
 it("staging failure leaves the original reservation recoverable after its bounded run lease",async()=>{
  await reserveCreditRun("u",500,"s","r");
  db.failTransactionsWhen(writes=>writes.some(w=>w.path==="sessions/s"));
  await expect(prepareCreditRunSettlement("u","r",100,{userId:"u",status:"complete"})).rejects.toThrow("Injected");
  await recoverCreditRuns("u");expect(db.store["users/u"].creditBalance).toBe(0);
  db.failTransactionsWhen();db.store["credit_runs/r"].leaseUntil=Date.now()-1;
  await recoverCreditRuns("u");expect(db.store["users/u"].creditBalance).toBe(500);
  await expect(prepareCreditRunSettlement("u","r",0,{userId:"u",status:"complete"})).rejects.toThrow("expired");
  expect(db.store["sessions/s"]).toBeUndefined();
 });
 it("expired recovery cannot refund a successor's reservation or overwrite its session",async()=>{
  await reserveCreditRun("u",300,"s","old");db.store["credit_runs/old"].leaseUntil=0;
  await recoverCreditRuns("u");await reserveCreditRun("u",400,"s","new");
  db.store["sessions/s"]={userId:"u",billingRunId:"new",creditsUsed:80,status:"running",activeRun:{id:"new",expiresAt:Date.now()+SESSION_RUN_LEASE_MS}};
  await Promise.all([recoverCreditRuns("u"),applyCreditRunSettlement("u","old")]);
  expect(db.store["users/u"].creditBalance).toBe(100);expect(db.store["sessions/s"].status).toBe("running");
  await expect(prepareCreditRunSettlement("u","old",1,{userId:"u"})).rejects.toThrow();
 });
 it("a replaced session lease fences a late worker before its result or refund intent commits",async()=>{
  await reserveCreditRun("u",300,"s","old");
  db.store["sessions/s"]={userId:"u",activeRun:{id:"new",expiresAt:Date.now()+SESSION_RUN_LEASE_MS}};
  await expect(prepareCreditRunSettlement("u","old",100,{userId:"u"},{sessionId:"s",runId:"old"})).rejects.toThrow("replaced");
  expect(db.store["credit_runs/old"].state).toBe("active");
 });
 it("cancellation refunds the full run but never prior continuation usage",async()=>{
  await reserveCreditRun("u",300,"s","r",0,80);
  await prepareCreditRunSettlement("u","r",0,{userId:"u",status:"cancelled",transcript:"partial"});
  await Promise.all([applyCreditRunSettlement("u","r"),applyCreditRunSettlement("u","r")]);
  expect(db.store["users/u"].creditBalance).toBe(500);expect(db.store["sessions/s"]).toMatchObject({creditsUsed:80,creditsDebited:80,status:"cancelled"});
 });
 it("normal admin refunds cannot double-return recovered orphan reservations",async()=>{
  await reserveCreditRun("u",300,"s","r");const charge=Object.keys(db.store).find(k=>k.startsWith("credit_transactions/"))!.split("/")[1];
  db.store["credit_runs/r"].leaseUntil=0;
  await expect(addCredits("u",300,"refund",{refundTransactionId:charge})).rejects.toThrow();
  expect(db.store["users/u"].creditBalance).toBe(500);
 });
 it("lets the normal admin path refund a proven old legacy orphan, but not a new missing session",async()=>{
  db.store["credit_transactions/old"]={userId:"u",type:"usage",amount:-100,sessionId:"missing",createdAt:new Date(Date.now()-SESSION_RUN_LEASE_MS-1).toISOString()};
  await addCredits("u",100,"refund",{refundTransactionId:"old"});
  await expect(addCredits("u",1,"refund",{refundTransactionId:"old"})).rejects.toThrow("remain refundable");
  db.store["credit_transactions/new"]={userId:"u",type:"usage",amount:-100,sessionId:"new",createdAt:new Date().toISOString()};
  await expect(addCredits("u",100,"refund",{refundTransactionId:"new"})).rejects.toThrow("finish");
 });
});
