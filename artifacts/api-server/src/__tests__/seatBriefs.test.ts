import {beforeEach, expect, it, vi} from "vitest";
import express from "express";
import request from "supertest";
import {FieldValue} from "firebase-admin/firestore";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:async()=>({uid:"admin",admin:true})}));
vi.mock("../lib/providers/index.js",async importOriginal=>({...await importOriginal<typeof import("../lib/providers/index.js")>(),createProviderAsync:vi.fn(),getConfiguredProvidersAsync:async()=>["mock"]}));
vi.mock("../lib/conscienceConfig.js",async importOriginal=>({...await importOriginal<typeof import("../lib/conscienceConfig.js")>(),getConscienceClause:async()=>({text:"",version:"test"})}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {createProviderAsync} from "../lib/providers/index.js";
import adminRouter from "../routes/admin.js";
import {getAllSeatBriefs,SEAT_IDS} from "../lib/seatBriefs.js";
import {runBrainSession} from "../lib/brainEngine.js";
const app=express().use(express.json()).use(adminRouter);
let stored:Record<string,unknown>;
let failRead=false,failWrite=false;
beforeEach(()=>{
  stored={};failRead=false;failWrite=false;
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({
    get:async()=>{if(failRead)throw new Error("read failed");return {exists:true,data:()=>({...stored})};},
    set:async(values:Record<string,unknown>)=>{if(failWrite)throw new Error("write failed");for(const [k,v] of Object.entries(values)){if(v instanceof Object && "isEqual" in v && (v as any).isEqual(FieldValue.delete()))delete stored[k];else stored[k]=v;}},
  })})} as any);
});
it("saves every seat, reloads it, and feeds those exact rules into the next run",async()=>{
  await getAllSeatBriefs();
  for(const id of SEAT_IDS){
    const response=await request(app).patch(`/admin/seat-briefs/${id}`).set("Authorization","Bearer test").send({text:`Saved ${id} rule.\nUse the owner's instructions.`});
    expect(response.status).toBe(200);
  }
  const reload=await request(app).get("/admin/seat-briefs").set("Authorization","Bearer test");
  expect(reload.status).toBe(200);
  const output=["Open","Argue","ARTIFACT_NEEDED: yes","Blueprint","Draft","PASS","APPROVED\nCONFIDENCE: 90","Verdict"];
  const provider={name:"mock",streamChat:vi.fn(async function*(_messages:any[]){yield output.shift()??"Done";}),getLastUsage:()=>({inputTokens:1,outputTokens:1})};
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  await runBrainSession({question:"Test",config:{litigantCount:1,confidenceTarget:70,maxIterations:1,responseMode:"concise",outputFormat:"verdict",outputPreferenceMode:"document"},res:{write:()=>true,flush:()=>{},writableEnded:false} as any});
  const systems=provider.streamChat.mock.calls.flatMap(call=>call[0]).filter((m:any)=>m.role==="system");
  for(const id of SEAT_IDS){
    expect(reload.body.active[id]).toBe(stored[id]);
    expect(systems.some((m:any)=>m.content.startsWith(stored[id] as string))).toBe(true);
  }
  stored.orchestrator="Changed on another instance";
  expect((await getAllSeatBriefs()).orchestrator).toBe(stored.orchestrator);
});
it("reports failed saves and rejects invalid text",async()=>{
  failWrite=true;
  expect((await request(app).patch("/admin/seat-briefs/builder").set("Authorization","Bearer test").send({text:"New"})).status).toBe(500);
  expect(stored.builder).toBeUndefined();
  for(const text of ["",42,{}])expect((await request(app).patch("/admin/seat-briefs/builder").set("Authorization","Bearer test").send({text})).status).toBe(400);
});
it("does not silently replace saved rules when their read fails",async()=>{
  stored.builder="Owner rule";await getAllSeatBriefs();failRead=true;
  await expect(getAllSeatBriefs()).rejects.toThrow("read failed");
  expect((await request(app).get("/admin/seat-briefs").set("Authorization","Bearer test")).status).toBe(500);
});
it("reset returns the same default to the editor and engine",async()=>{
  stored.builder="Custom";
  expect((await request(app).delete("/admin/seat-briefs/builder").set("Authorization","Bearer test")).status).toBe(200);
  const reload=await request(app).get("/admin/seat-briefs").set("Authorization","Bearer test");
  expect(reload.body.active.builder).toBe(reload.body.defaults.builder);
  expect((await getAllSeatBriefs()).builder).toBe(reload.body.active.builder);
});
