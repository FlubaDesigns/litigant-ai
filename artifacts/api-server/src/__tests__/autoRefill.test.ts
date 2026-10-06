import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true}));
vi.mock("../lib/squareClient.js",async original=>({...await original<typeof import("../lib/squareClient.js")>(),isSquareConfigured:()=>true,getSquareLocationId:()=>"location",getSquarePayment:vi.fn(),createSquareCustomer:vi.fn(),saveSquareCard:vi.fn(),disableSquareCard:vi.fn(),chargeSquareCard:vi.fn()}));
vi.mock("../lib/emailService.js",()=>({isResendConfigured:()=>false,sendPaymentReceiptEmail:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {chargeSquareCard,getSquarePayment,saveSquareCard,createSquareCustomer,SquareApiError} from "../lib/squareClient.js";
import {checkAndTriggerAutoRefill,setAutoRefillPreference,eligibleCardPayment,recordRefillPayment} from "../lib/autoRefill.js";
import {handleSquareEvent} from "../lib/squareEventHandler.js";

function database() {
 const store:Record<string,any>={}; let lock=Promise.resolve();let nextId=0;
 const merge=(path:string,value:any,patch=false)=>{
  if(!patch)store[path]={}; store[path]??={};
  for(const [key,val] of Object.entries(value)){const keys=key.split('.');let at=store[path];while(keys.length>1){const part=keys.shift()!;at[part]??={};at=at[part];}at[keys[0]]=val;}
 };
 const ref=(path:string):any=>({path,get:async()=>({exists:path in store,data:()=>store[path]}),set:async(v:any,o:any)=>merge(path,v,o?.merge),update:async(v:any)=>merge(path,v,true)});
 return {store,collection:(name:string)=>({doc:(id:string)=>ref(`${name}/${id}`),add:async(v:any)=>{const id=String(++nextId);merge(`${name}/${id}`,v);return {id};}}),runTransaction:<T>(fn:(t:any)=>Promise<T>)=>{
   const result=lock.then(async()=>{const writes:Array<()=>void>=[];const out=await fn({get:(r:any)=>r.get(),set:(r:any,v:any,o:any)=>writes.push(()=>merge(r.path,v,o?.merge)),update:(r:any,v:any)=>writes.push(()=>merge(r.path,v,true))});writes.forEach(f=>f());return out;});lock=result.then(()=>{},()=>{});return result;
 }};
}
let db:ReturnType<typeof database>;
const pref={enabled:true,thresholdCredits:100,dollarAmount:20,consentVersion:1,consentAt:123};
const cardPayment=()=>({id:"manual",status:"COMPLETED",location_id:"location",note:"LITIGANT:userId=u,creditAmount=500,pack=starter",created_at:new Date().toISOString(),card_details:{status:"CAPTURED",entry_method:"KEYED",card:{card_brand:"VISA",last_4:"1111"}}});
beforeEach(()=>{
 vi.clearAllMocks();db=database();vi.mocked(getFirestoreDb).mockReturnValue(db as any);
 db.store['users/u']={plan:"pro",creditBalance:50,autoRefill:{...pref},email:"example@example.com"};
 db.store['billing_accounts/u']={customerId:"customer",cardId:"card",cardBrand:"VISA",cardLast4:"1111"};
 vi.mocked(chargeSquareCard).mockImplementation(async (r:any)=>({id:"payment",status:"COMPLETED",note:r.note,amount_money:r.amount_money}));
});
describe("automatic card top-ups",()=>{
 it("charges once across concurrent runs and duplicate webhooks, then grants credits once",async()=>{
  await Promise.all([checkAndTriggerAutoRefill("u",50,"one"),checkAndTriggerAutoRefill("u",50,"two")]);
  expect(chargeSquareCard).toHaveBeenCalledTimes(1);
  const request=vi.mocked(chargeSquareCard).mock.calls[0][0] as any;
  expect(request).toMatchObject({amount_money:{amount:2000,currency:"USD"},customer_details:{customer_initiated:false,seller_keyed_in:false}});
  await handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:"duplicate",data:{object:{payment:{id:"payment",status:"COMPLETED",note:request.note,amount_money:request.amount_money}}}});
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
