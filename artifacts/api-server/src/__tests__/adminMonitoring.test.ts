import {beforeEach,expect,it,vi} from "vitest";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:async()=>({uid:"admin",admin:true})}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import adminRouter from "../routes/admin.js";
const app=express().use(adminRouter);
const now=()=>{const date=new Date(Date.now()-1000);return {toDate:()=>date};};
let records:Record<string,any[]>,fail:string|null,queries:any[];
beforeEach(()=>{
  records={sessions:[],feedback:[],api_logs:[]};fail=null;queries=[];
  vi.mocked(getFirestoreDb).mockReturnValue({collection:(name:string)=>{
    let rows=records[name] ?? [];const query:any={
      where:(field:string,op:string,value:any)=>{queries.push([name,field,op,value]);rows=rows.filter(row=>op==="in"?value.includes(row[field]):op==="=="?row[field]===value:row[field]?.toDate?.() && (op===">="?row[field].toDate()>=value:row[field].toDate()<=value));return query;},
      orderBy:(field:string)=>{rows=rows.filter(row=>row[field]!==undefined);rows.sort((a,b)=>b[field].toDate()-a[field].toDate());return query;},
      select:(...fields:string[])=>{queries.push([name,"select",...fields]);return query;},
      limit:(n:number)=>{rows=rows.slice(0,n);return query;},
      get:async()=>{if(fail===name)throw Error("Read failed");return {size:rows.length,docs:rows.map((row,i)=>({id:row.id??String(i),data:()=>row}))};}
    };return query;
  }} as any);
});
const read=(path:string)=>request(app).get(`/admin/${path}`).set("Authorization","Bearer test");
it("reports saved model costs and settled credits without counting unrelated transactions",async()=>{
  records.sessions=[{createdAt:now(),creditsUsed:8,callUsage:[
    {provider:"openai",model:"shared",inputTokens:100,outputTokens:50,cachedInputTokens:20,costUSD:.12,usageSource:"provider"},
    {provider:"openai",model:"shared",inputTokens:40,outputTokens:10,costUSD:.03,usageSource:"provider"},
    {provider:"anthropic",model:"shared",inputTokens:30,outputTokens:5,cacheWriteTokens:10,cacheWrite1hTokens:5,costUSD:.04,usageSource:"estimated"},
  ]},{createdAt:now(),creditsUsed:0}];
  records.credit_transactions=[{type:"purchase",amount:1000},{type:"usage",amount:-50},{type:"refund",amount:42}];
  const r=await read("api-usage");expect(r.status).toBe(200);
  expect(r.body).toMatchObject({totalSessions:2,totalCreditsUsed:8,totalCalls:3,totalInputTokens:170,totalOutputTokens:65,sessionsMissingCallDetails:1,estimatedCalls:1,truncated:false});
  expect(r.body.costUSD).toBeCloseTo(.19);
  expect(r.body.byModel).toHaveLength(2);
  expect(r.body.byModel[0]).toMatchObject({provider:"openai",model:"shared",calls:2,cachedInputTokens:20});
  expect(r.body.byDay[0]).toMatchObject({sessions:2,creditsUsed:8});
  expect(queries.some(q=>q[0]==="credit_transactions" || q[0]==="api_logs")).toBe(false);
  expect(queries).toContainEqual(["sessions","select","createdAt","creditsUsed","callUsage"]);
});
it("keeps missing prices distinct from zero cost and reports missing credit totals",async()=>{
  records.sessions=[{createdAt:now(),callUsage:[{provider:"gemini",model:"a",inputTokens:5,outputTokens:0,costUSD:0,usageSource:"provider"},{provider:"gemini",model:"a",inputTokens:5,outputTokens:0}]}];
  const r=await read("api-usage");expect(r.body).toMatchObject({unpricedCalls:1,estimatedCalls:1,sessionsMissingCredits:1,costUSD:0});
});
it("excludes older sessions and labels capped reports",async()=>{
  records.sessions=Array.from({length:1001},()=>({createdAt:now(),creditsUsed:1}));
  records.sessions.push({createdAt:{toDate:()=>new Date("2020-01-01")},creditsUsed:999});
  const r=await read("api-usage");expect(r.body).toMatchObject({totalSessions:1000,totalCreditsUsed:1000,truncated:true,limit:1000});
  expect(r.body.byDay).toHaveLength(1);
});
it("shows the failure marker even when a resumed session still has a saved successful status",async()=>{
  records.sessions=[{id:"resumed",createdAt:now(),lastRunErrorAt:now(),lastRunErrorMessage:"Session timed out.",status:"complete"}];
  const r=await read("error-logs");expect(r.status).toBe(200);
  expect(r.body.failedSessions[0]).toMatchObject({sessionId:"resumed",message:"Session timed out.",status:"complete"});
});
it("finds negative feedback even after hundreds of positive responses",async()=>{
  records.feedback=[...Array.from({length:600},()=>({createdAt:now(),rating:"good"})),{id:"bad",createdAt:now(),rating:"bad"},{id:"warn",createdAt:now(),rating:"warn"}];
  const r=await read("abuse-flags");expect(r.status).toBe(200);
  expect(r.body.flags.map((f:any)=>f.id).sort()).toEqual(["bad","warn"]);
  expect(r.body).toMatchObject({totalCount:2,hasMore:false});
  expect(queries).toContainEqual(["feedback","rating","in",["bad","warn"]]);
});
it.each([["api-usage","sessions"],["error-logs","api_logs"],["error-logs","sessions"],["abuse-flags","feedback"]])("does not show empty success when %s cannot read %s",async(path,collection)=>{
  fail=collection;expect((await read(path)).status).toBe(500);
});
it.each(["api-usage","error-logs","abuse-flags"])("returns unavailable if %s has no database",async path=>{
  vi.mocked(getFirestoreDb).mockReturnValue(null);expect((await read(path)).status).toBe(503);
});
