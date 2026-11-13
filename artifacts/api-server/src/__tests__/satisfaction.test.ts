import {beforeEach,expect,it,vi} from "vitest";
import express from "express";
import request from "supertest";
const state=vi.hoisted(()=>({user:{uid:"owner",admin:true} as any,db:null as any}));
vi.mock("../lib/firebaseAdmin.js",()=>({verifyIdToken:async()=>state.user,getFirestoreDb:()=>state.db,isFirebaseConfigured:()=>true}));
vi.mock("../lib/adminLimitsConfig.js",()=>({getAdminLimits:async()=>({feedbackPerHour:100})}));
vi.mock("../lib/rateLimiter.js",()=>({makeRateLimiter:()=> (_req:any,_res:any,next:any)=>next()}));
import feedback from "../routes/feedback.js";
import admin from "../routes/admin/satisfaction.js";
import {satisfactionId} from "../lib/satisfaction.js";
const app=express().use(express.json()).use(feedback).use(admin);
let data:Record<string,any>,fail:boolean;
beforeEach(()=>{
 state.user={uid:"owner",admin:true};fail=false;
 data={"sessions/s":{userId:"owner",status:"complete"},"sessions/foreign":{userId:"other",status:"complete"},"sessions/running":{userId:"owner",status:"running"}};
 const doc=(path:string):any=>({path,get:async()=>{if(fail)throw Error("private failure");return{exists:!!data[path],data:()=>data[path]};}});
 state.db={collection:(name:string)=>({doc:(id:string)=>doc(name+"/"+id),where:(field:string)=>({aggregate:()=>({get:async()=>{
  if(fail)throw Error("private failure");const rows=Object.entries(data).filter(([path,value])=>path.startsWith('feedback/')&&typeof value[field]==='number'&&value[field]>=1).map(([,v])=>v);
  return{data:()=>({count:rows.length,average:rows.length?rows.reduce((n,r)=>n+r[field],0)/rows.length:null})};
 }})})}),runTransaction:async(fn:any)=>{const pending:any[]=[];const result=await fn({get:(ref:any)=>ref.get(),set:(ref:any,value:any)=>pending.push([ref.path,value])});for(const [p,v]of pending)data[p]=v;return result;}};
});
const ratings={kind:"satisfaction",version:1,sessionId:"s",answered:5,satisfied:4,reuse:3};
const post=(value:any=ratings)=>request(app).post('/feedback').set('Authorization','Bearer fixture').send(value);
const get=(path:string)=>request(app).get(path).set('Authorization','Bearer fixture');
it('validates all three integer ratings and rejects extra content',async()=>{
 for(const change of [{answered:0},{satisfied:6},{reuse:2.5},{reuse:"3"},{answered:null},{question:"private question"},{userId:"forged"},{version:2}])expect((await post({...ratings,...change})).status).toBe(400);
 expect(Object.keys(data).filter(k=>k.startsWith('feedback/'))).toEqual([]);
});
it('requires authentication, completed ownership and an account not being deleted',async()=>{
 expect((await request(app).post('/feedback').send(ratings)).status).toBe(401);
 for(const sessionId of ['foreign','missing'])expect((await post({...ratings,sessionId})).status).toBe(403);
 expect((await post({...ratings,sessionId:'running'})).status).toBe(409);
 data['account_deletions/owner']={phase:'deleting'};expect((await post()).status).toBe(409);
 expect((await get('/feedback/satisfaction/foreign')).status).toBe(403);
});
it('retry and edits preserve one response, creation time and owned reload',async()=>{
 expect((await get('/feedback/satisfaction/s')).body.ratings).toBeNull();
 expect((await post()).status).toBe(200);
 const path='feedback/'+satisfactionId('owner','s');data[path].createdAt='original';
 expect((await post()).status).toBe(200);expect((await post({...ratings,satisfied:2})).status).toBe(200);
 expect(Object.keys(data).filter(k=>k.startsWith('feedback/'))).toEqual([path]);
 expect(data[path]).toMatchObject({userId:'owner',satisfied:2,createdAt:'original'});
 expect((await get('/feedback/satisfaction/s')).body.ratings).toEqual({answered:5,satisfied:2,reuse:3});
 expect((await get('/admin/satisfaction')).body).toEqual({count:1,averages:{answered:5,satisfied:2,reuse:3},overall:10/3});
});
it('reports no responses distinctly, excludes old flags, and requires admin access',async()=>{
 data['feedback/old']={rating:'good'};
 expect((await get('/admin/satisfaction')).body).toEqual({count:0,overall:null,averages:{answered:null,satisfied:null,reuse:null}});
 state.user.admin=false;expect((await get('/admin/satisfaction')).status).toBe(403);
});
it('fails truthfully on storage errors without exposing details',async()=>{
 fail=true;for(const response of [await post(),await get('/feedback/satisfaction/s'),await get('/admin/satisfaction')]){expect(response.status).toBe(503);expect(response.text).not.toContain('private failure');}
});
