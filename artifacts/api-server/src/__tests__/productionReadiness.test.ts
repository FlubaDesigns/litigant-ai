import {afterEach,beforeEach,expect,it,vi} from "vitest";
import express from "express";
import request from "supertest";
const state=vi.hoisted(()=>({user:{uid:"owner"} as {uid:string}|null,db:null as any}));
vi.mock("../lib/firebaseAdmin.js",()=>({verifyIdToken:async()=>state.user,getFirestoreDb:()=>state.db}));
vi.mock("../lib/adminLimitsConfig.js",()=>({getAdminLimits:async()=>({feedbackPerHour:2,caseFilesPerHour:2,extractionTimeoutSeconds:15})}));
import feedback from "../routes/feedback.js";
import caseFile from "../routes/caseFile.js";
import health from "../routes/health.js";
const app=express().use(express.json()).use(feedback).use(caseFile).use(health);
let entries:any[], counters:Record<string,any>, broken:boolean;
beforeEach(()=>{
 entries=[];counters={};broken=false;state.user={uid:"owner"};
 state.db={collection:(name:string)=>({
  doc:(id:string)=>({id,get:async()=>{if(broken)throw Error("private failure");return {data:()=>name==="sessions"?{userId:id==="foreign"?"other":"owner"}:counters[id]};}}),
  add:async(data:any)=>{entries.push(data);},
 }),runTransaction:async(fn:any)=>fn({get:(ref:any)=>ref.get(),set:(ref:any,data:any)=>{counters[ref.id]=data;},update:(ref:any)=>{counters[ref.id].count++;}})};
});
afterEach(()=>vi.unstubAllEnvs());
const body={userId:"owner",sessionId:"session",turnId:"turn",role:"Verdict",rating:"bad"};
const post=(data:any=body)=>request(app).post("/feedback").set("Authorization","Bearer test").send(data);
it("rejects unauthenticated, forged, oversized and foreign-session feedback without writes",async()=>{
 expect((await request(app).post("/feedback").send(body)).status).toBe(401);
 expect((await post({...body,userId:"other"})).status).toBe(400);
 expect((await post({...body,notes:"x".repeat(2001)})).status).toBe(400);
 expect((await post({...body,sessionId:"foreign"})).status).toBe(403);
 expect(entries).toEqual([]);
});
it("enforces the account allowance across client requests and stamps the verified owner",async()=>{
 expect((await post()).status).toBe(201);expect((await post()).status).toBe(201);
 expect((await post()).status).toBe(429);expect(entries).toHaveLength(2);
 expect(entries[0]).toMatchObject(body);expect(entries[0].createdAt).toBeDefined();
});
it("fails closed when the shared limiter fails",async()=>{
 broken=true;expect((await post()).status).toBe(503);expect(entries).toEqual([]);
});
it("keeps liveness distinct from dependency readiness",async()=>{
 state.db=null;expect((await request(app).get("/live")).status).toBe(200);
 expect((await request(app).get("/health")).status).toBe(503);
});
it("checks the dependency and does not disclose its error",async()=>{
 expect((await request(app).get("/health")).status).toBe(200);
 broken=true;const result=await request(app).get("/health");expect(result.status).toBe(503);
 expect(JSON.stringify(result.body)).not.toContain("private failure");
});

it("shares the file allowance between URL fetches and uploads before parsing",async()=>{
 const upload=()=>request(app).post("/case-file/upload").set("Authorization","Bearer test").attach("file",Buffer.from("evidence"),"evidence.txt");
 expect((await upload()).status).toBe(200);
 expect((await request(app).post("/case-file/fetch-url").set("Authorization","Bearer test").send({url:"file:///etc/passwd"})).status).toBe(400);
 const blocked=await request(app).post("/case-file/upload").set("Authorization","Bearer test").set("Content-Type","multipart/form-data").send("malformed input");
 expect(blocked.status).toBe(429);
 state.user={uid:"another-owner"};expect((await upload()).status).toBe(200);
});
it("rejects uploads before parsing when shared quota storage is down",async()=>{
 broken=true;
 const result=await request(app).post("/case-file/upload").set("Authorization","Bearer test").set("Content-Type","multipart/form-data").send("malformed input");
 expect(result.status).toBe(503);
});
