import { billingRecoveryDatabase } from "./billingRecoveryDatabase.js";
import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true}));
vi.mock("../lib/squareClient.js",async original=>({...await original<typeof import("../lib/squareClient.js")>(),isSquareConfigured:()=>true,getSquareLocationId:()=>"location",getSquarePayment:vi.fn(),createSquareCustomer:vi.fn(),saveSquareCard:vi.fn(),disableSquareCard:vi.fn(),chargeSquareCard:vi.fn(),findSquareRefillPayment:vi.fn()}));
vi.mock("../lib/emailService.js",()=>({isResendConfigured:()=>false,sendPaymentReceiptEmail:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {chargeSquareCard,getSquarePayment,findSquareRefillPayment,saveSquareCard,createSquareCustomer,SquareApiError} from "../lib/squareClient.js";
import {checkAndTriggerAutoRefill,setAutoRefillPreference,eligibleCardPayment,recordRefillPayment,reconcileAutoRefillAttempt,getAutoRefillStatus,removeAutoRefillCard} from "../lib/autoRefill.js";
import {reserveCreditRun,prepareCreditRunSettlement,applyCreditRunSettlement} from "../lib/creditRunSettlement.js";
import {handleSquareEvent} from "../lib/squareEventHandler.js";

function database() { return billingRecoveryDatabase(); }

let db:ReturnType<typeof database>;
const pref={enabled:true,thresholdCredits:100,dollarAmount:20,consentVersion:1,consentAt:123};
const cardPayment=()=>({id:"manual",status:"COMPLETED",location_id:"location",note:"LITIGANT:userId=u,creditAmount=500,pack=starter",created_at:new Date().toISOString(),card_details:{status:"CAPTURED",entry_method:"KEYED",card:{card_brand:"VISA",last_4:"1111"}}});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("External calls forbidden");}));db=database();vi.mocked(getFirestoreDb).mockReturnValue(db as any);
 db.store['users/u']={plan:"pro",creditBalance:50,autoRefill:{...pref},email:"example@example.com"};
 db.store['billing_accounts/u']={customerId:"customer",cardId:"card",cardBrand:"VISA",cardLast4:"1111"};
 vi.mocked(chargeSquareCard).mockImplementation(async (r:any)=>({id:"payment",status:"COMPLETED",location_id:"location",note:r.note,amount_money:r.amount_money}));
});
describe("automatic card top-ups",()=>{
 it("charges once across concurrent runs and duplicate webhooks, then grants credits once",async()=>{
  await Promise.all([checkAndTriggerAutoRefill("u",50,"one"),checkAndTriggerAutoRefill("u",50,"two")]);
  expect(chargeSquareCard).toHaveBeenCalledTimes(1);
  const request=vi.mocked(chargeSquareCard).mock.calls[0][0] as any;
  expect(request).toMatchObject({amount_money:{amount:2000,currency:"USD"},customer_details:{customer_initiated:false,seller_keyed_in:false}});
  await handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:"duplicate",data:{object:{payment:{id:"payment",status:"COMPLETED",location_id:"location",note:request.note,amount_money:request.amount_money}}}});
  expect(db.store['users/u'].creditBalance).toBe(2050);
  expect(db.store['billing_accounts/u'].activeAttempt).toBeNull();
  expect(Object.keys(db.store).filter(k=>k.startsWith('credit_transactions/'))).toHaveLength(1);
 });
 it.each(["off","legacy","above","guest","banned"])("never charges for %s",async state=>{
  if(state==="off")db.store['users/u'].autoRefill.enabled=false;
  if(state==="legacy")delete db.store['users/u'].autoRefill.consentVersion;
  if(state==="above")db.store['users/u'].creditBalance=101;
  if(state==="guest")db.store['users/u'].guestInvitationId="guest";
  if(state==="banned")db.store['users/u'].banned=true;
  await checkAndTriggerAutoRefill("u",0,"one");expect(chargeSquareCard).not.toHaveBeenCalled();
 });
 it("turns off on decline and never retries a declined card automatically",async()=>{
  vi.mocked(chargeSquareCard).mockRejectedValue(new SquareApiError(400,"CARD_DECLINED"));
  await checkAndTriggerAutoRefill("u",50,"one");await checkAndTriggerAutoRefill("u",50,"two");
  expect(chargeSquareCard).toHaveBeenCalledTimes(1);expect(db.store['users/u'].creditBalance).toBe(50);expect(db.store['users/u'].autoRefill.enabled).toBe(false);
 });
 it("retries an unknown outcome with the identical request and idempotency key",async()=>{
  vi.mocked(chargeSquareCard).mockRejectedValueOnce(new Error("network timeout"));
  await checkAndTriggerAutoRefill("u",50,"one");
  const id=db.store['billing_accounts/u'].activeAttempt;db.store[`auto_refill_attempts/${id}`].leaseUntil=0;
  await checkAndTriggerAutoRefill("u",50,"two");
  expect(vi.mocked(chargeSquareCard).mock.calls[0]).toEqual(vi.mocked(chargeSquareCard).mock.calls[1]);expect(db.store['users/u'].creditBalance).toBe(2050);
 });
 it("does not create a new charge for a duplicate completed session event",async()=>{
  await checkAndTriggerAutoRefill("u",50,"one");db.store['users/u'].creditBalance=10;
  await checkAndTriggerAutoRefill("u",10,"one");expect(chargeSquareCard).toHaveBeenCalledTimes(1);
 });
 it("requires consent for enabling or changing a charge amount",async()=>{
  await expect(setAutoRefillPreference("u",{enabled:true,thresholdCredits:100,dollarAmount:50})).rejects.toThrow("Authorize");
  await setAutoRefillPreference("u",{enabled:true,thresholdCredits:100,dollarAmount:50,consent:true});
  expect(db.store['users/u'].autoRefill.dollarAmount).toBe(50);expect(chargeSquareCard).not.toHaveBeenCalled();
 });
 it("uses only the authenticated user's recent direct-card payment to store a card",async()=>{
  db.store['billing_accounts/u']={};await recordRefillPayment('u',cardPayment());
  vi.mocked(getSquarePayment).mockResolvedValue(cardPayment());vi.mocked(createSquareCustomer).mockResolvedValue({id:"newcustomer"});vi.mocked(saveSquareCard).mockResolvedValue({id:"newcard",card_brand:"VISA",last_4:"1111"});
  await setAutoRefillPreference("u",{enabled:true,thresholdCredits:100,dollarAmount:20,consent:true});
  expect(saveSquareCard).toHaveBeenCalledWith("manual","newcustomer",expect.any(String));expect(db.store['users/u'].autoRefill.enabled).toBe(true);
 });
 it("rejects another user's payment and expired or wallet payments",()=>{
  expect(eligibleCardPayment(cardPayment(),'other')).toBe(false);
  expect(eligibleCardPayment({...cardPayment(),created_at:new Date(Date.now()-86400001).toISOString()},'u')).toBe(false);
  expect(eligibleCardPayment({...cardPayment(),card_details:{status:"CAPTURED",entry_method:"ON_FILE"}},'u')).toBe(false);
 });
});

describe("existing top-up recovery while disabled",()=>{
 async function pending() {
  vi.mocked(chargeSquareCard).mockImplementation(async (request:any)=>({id:"pending",status:"PENDING",location_id:"location",note:request.note,amount_money:request.amount_money}));
  await checkAndTriggerAutoRefill("u",50,"run");
  const id=db.store["billing_accounts/u"].activeAttempt;
  const attempt=db.store[`auto_refill_attempts/${id}`];
  return {id,attempt,payment:{id:"pending",location_id:"location",note:attempt.request.note,amount_money:attempt.request.amount_money,status:"FAILED"}};
 }
 it.each(["FAILED","CANCELED"])("settles delayed %s events after disabling and removing the card",async status=>{
  const {payment,id}=await pending();await removeAutoRefillCard("u");
  await handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:"terminal",data:{object:{payment:{...payment,status}}}});
  expect(db.store["billing_accounts/u"]).toMatchObject({activeAttempt:null,refillStatus:"failed",cardId:null});
  expect(db.store[`auto_refill_attempts/${id}`].status).toBe(status.toLowerCase());
  await checkAndTriggerAutoRefill("u",50,"later");expect(chargeSquareCard).toHaveBeenCalledTimes(1);
 });
 it("queries and settles an existing payment without card or new-charge permission",async()=>{
  const {payment,attempt}=await pending();await removeAutoRefillCard("u");attempt.leaseUntil=0;
  vi.mocked(getSquarePayment).mockResolvedValue(payment);
  await getAutoRefillStatus("u");expect(getSquarePayment).toHaveBeenCalledWith("pending");
  expect(db.store["billing_accounts/u"].activeAttempt).toBeNull();expect(chargeSquareCard).toHaveBeenCalledTimes(1);
 });
 it("unknown payment lookup after disable never calls charge and no-match stays unresolved",async()=>{
  const {attempt}=await pending();delete attempt.paymentId;attempt.leaseUntil=0;await removeAutoRefillCard("u");
  vi.mocked(findSquareRefillPayment).mockResolvedValue(null);await reconcileAutoRefillAttempt("u");
  expect(findSquareRefillPayment).toHaveBeenCalledOnce();expect(chargeSquareCard).toHaveBeenCalledTimes(1);
  expect(db.store["billing_accounts/u"].activeAttempt).toBeTruthy();expect(db.store["users/u"].creditBalance).toBe(50);
 });
 it("does not overwrite a concurrent completed webhook with stale failed lookup status",async()=>{
  const {payment,attempt}=await pending();attempt.leaseUntil=0;
  vi.mocked(getSquarePayment).mockImplementation(async()=>{
   await handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:"paid",data:{object:{payment:{...payment,status:"COMPLETED"}}}});
   throw new Error("Lost status response");
  });
  await expect(reconcileAutoRefillAttempt("u")).rejects.toThrow("Lost");
  expect(db.store["billing_accounts/u"]).toMatchObject({activeAttempt:null,refillStatus:"completed",refillError:null});
  expect(db.store["users/u"].creditBalance).toBe(2050);
 });
 it("a payment lookup 404 is not treated as a declined charge",async()=>{
  const {attempt}=await pending();attempt.leaseUntil=0;
  vi.mocked(getSquarePayment).mockRejectedValue(new SquareApiError(404,"NOT_FOUND"));
  await checkAndTriggerAutoRefill("u",50,"later");
  expect(db.store["billing_accounts/u"].activeAttempt).toBeTruthy();expect(db.store["users/u"].autoRefill.enabled).toBe(true);
 });
 it("validates location and immutable authorization before minting credits",async()=>{
  const {payment}=await pending();
  await expect(handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:"wrong",data:{object:{payment:{...payment,status:"COMPLETED",location_id:"elsewhere"}}}})).rejects.toThrow("authorization");
  expect(db.store["users/u"].creditBalance).toBe(50);
 });
});

describe("holds never trigger new monetary charges",()=>{
 it("defers charging until concurrent reservations have settled and genuine balance is low",async()=>{
  db.store["users/u"].creditBalance=500;
  await reserveCreditRun("u",100,"a","a");await reserveCreditRun("u",400,"b","b");
  await prepareCreditRunSettlement("u","a",10,{userId:"u",status:"complete"});await applyCreditRunSettlement("u","a");
  expect(db.store["users/u"].creditBalance).toBe(90);
  await checkAndTriggerAutoRefill("u",90,"a");expect(chargeSquareCard).not.toHaveBeenCalled();
  await prepareCreditRunSettlement("u","b",400,{userId:"u",status:"complete"});
  await checkAndTriggerAutoRefill("u",90,"b");expect(chargeSquareCard).not.toHaveBeenCalled();
  await applyCreditRunSettlement("u","b");await checkAndTriggerAutoRefill("u",90,"b");
  expect(chargeSquareCard).toHaveBeenCalledOnce();expect(db.store["users/u"].creditBalance).toBe(2090);
 });
});
