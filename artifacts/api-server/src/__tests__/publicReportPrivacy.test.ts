import {beforeEach,expect,it,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../lib/firebaseAdmin.js',()=>({getFirestoreDb:vi.fn()}));
import {getFirestoreDb} from '../lib/firebaseAdmin.js';
import router from '../routes/report.js';
import {reviewStatus} from '@workspace/api-zod/session';
const app=express().use(router);
let record:any;
let turns:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 record={userId:'owner',shared:true,shareId:'public',status:'complete',acceptedAt:123,courtroomOutcome:{reason:'convergence_failure'},transcript:'Saved',debateNotes:'Notes',roundsCompleted:2,litigantCount:3};
 turns=vi.fn(()=>{throw new Error('Current report must not query turn collection');});
 const query:any={where:()=>query,limit:()=>query,get:async()=>({empty:!record.shared,docs:record.shared?[{id:'s',data:()=>record,ref:{collection:turns}}]:[]})};
 const counters=new Map<string,any>();
 vi.mocked(getFirestoreDb).mockReturnValue({runTransaction:async (fn:any)=>fn({get:async (ref:any)=>({data:()=>counters.get(ref.id)}),set:(ref:any,value:any)=>counters.set(ref.id,value),update:(ref:any)=>{counters.get(ref.id).count++;}}),collection:(name:string)=>name==='sessions'?query:{doc:(id:string)=>({id,get:async()=>({data:()=>({plan:'free'})})})}} as any);
});
it('preserves unapproved owner acceptance and avoids turn reads for current reports',async()=>{
 const r=await request(app).get('/report/public');expect(r.status).toBe(200);
 expect(r.headers['cache-control']).toBe('no-store');
 expect(reviewStatus(r.body)).toBe('Accepted by owner — not auditor approved');expect(turns).not.toHaveBeenCalled();
 record.shared=false;expect((await request(app).get('/report/public')).status).toBe(404);
});
it('limits repeated anonymous reads before querying the report',async()=>{
 let limited=false;
 for(let i=0;i<125;i++) {const r=await request(app).get('/report/public');if(r.status===429){limited=true;break;}expect(r.status).toBe(200);}
 expect(limited).toBe(true);
});
it('does not label interrupted or unreviewed work as approved',()=>{
 expect(reviewStatus({status:'complete'})).toBe('Not auditor approved');
 expect(reviewStatus({acceptedAt:123,outputIncomplete:true})).toBe('Interrupted — not approved');
 expect(reviewStatus({courtroomOutcome:{reason:'approved'}})).toBe('Auditor approved');
});
