import {afterEach,describe,it,expect,vi} from "vitest";
vi.mock("@/lib/firebase",()=>({auth:{currentUser:{getIdToken:async()=>"local-test-token"}}}));
import {getPaymentHistory,getTransactions} from "./billingService";
afterEach(()=>vi.unstubAllGlobals());
describe("billing history service",()=>{
 it("preserves pagination and unknown legacy amounts",async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({data:[{id:"legacy",amount:null,currency:null}],nextCursor:"older"})));vi.stubGlobal("fetch",fetch);
  expect(await getPaymentHistory("page/1")).toEqual({data:[{id:"legacy",amount:null,currency:null}],nextCursor:"older"});
  expect(fetch.mock.calls[0][0]).toContain("cursor=page%2F1");
 });
 it.each([getPaymentHistory,getTransactions])("surfaces a recovery or index error instead of inventing empty history",async read=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("Index not ready",{status:503})));
  await expect(read()).rejects.toThrow("history");
 });
});
