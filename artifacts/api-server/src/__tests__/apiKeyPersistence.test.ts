import {beforeEach,afterEach,expect,it,vi} from "vitest";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:async()=>({uid:"admin",admin:true})}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getApiKey,invalidateApiKeyCache} from "../lib/apiKeyStore.js";
import adminRouter from "../routes/admin.js";
const app=express().use(express.json()).use(adminRouter);
let providers:Record<string,any>,failWrite:boolean;
beforeEach(()=>{
  providers={};failWrite=false;invalidateApiKeyCache();
  vi.stubEnv("OPENAI_API_KEY","fictional-deployment-value");
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({
    get:async()=>({exists:true,data:()=>({providers})}),
    set:async(data:any,options:any)=>{
      if(failWrite)throw Error("write failed");
      const entries=Object.fromEntries(Object.entries(data.providers).map(([id,p]:any)=>[id,{...p,updatedAt:"2026-10-05T00:00:00Z"}]));
      providers=options?.merge ? {...providers,...entries} : entries;
    },
  })})} as any);
});
afterEach(()=>{vi.unstubAllEnvs();invalidateApiKeyCache();});
const api=(method:"get"|"put"|"delete",path:string)=>request(app)[method](path).set("Authorization","Bearer test");
it("replaces the active credential, preserves other providers and returns only masked values",async()=>{
  expect((await getApiKey("openai"))?.key).toBe("fictional-deployment-value");
  expect((await api("put","/admin/api-keys/openai").send({key:"  fictional-new-value  ",label:"OpenAI"})).status).toBe(200);
  expect((await getApiKey("openai"))?.key).toBe("fictional-new-value");
  expect((await api("put","/admin/api-keys/gemini").send({key:"fictional-google-value",label:"Google Gemini"})).status).toBe(200);
  expect((await getApiKey("openai"))?.key).toBe("fictional-new-value");
  invalidateApiKeyCache();
  expect((await getApiKey("gemini"))?.key).toBe("fictional-google-value");
  const listed=await api("get","/admin/api-keys");
  expect(listed.status).toBe(200);
  expect(listed.body.providers.find((p:any)=>p.id==="openai")).toMatchObject({source:"firestore",maskedKey:"fictio••••••••alue"});
  expect(JSON.stringify(listed.body)).not.toContain("fictional-new-value");
  expect(JSON.stringify(listed.body)).not.toContain("fictional-google-value");
  expect((await api("delete","/admin/api-keys/openai")).status).toBe(200);
  expect((await getApiKey("openai"))?.key).toBe("fictional-deployment-value");
  expect((await getApiKey("gemini"))?.key).toBe("fictional-google-value");
});
it("rejects empty keys and keeps the active credential if saving fails",async()=>{
  expect((await api("put","/admin/api-keys/openai").send({key:"",label:"OpenAI"})).status).toBe(400);
  failWrite=true;
  expect((await api("put","/admin/api-keys/openai").send({key:"fictional-unsaved-value",label:"OpenAI"})).status).toBe(500);
  expect((await getApiKey("openai"))?.key).toBe("fictional-deployment-value");
});

it("saves and replaces each built-in provider without crossing credentials after reload",async()=>{
  const entries=[["openai","OpenAI"],["anthropic","Anthropic (Claude)"],["grok","xAI Grok"],["gemini","Google Gemini"]];
  for(const [id,label] of entries) {
    const saved=await api("put",`/admin/api-keys/${id}`).send({key:`  fictional-${id}-initial  `,label});
    expect(saved.status).toBe(200);
    expect(saved.body.providerId).toBe(id);
  }
  for(const [id,label] of entries) {
    invalidateApiKeyCache();
    expect((await getApiKey(id))?.key).toBe(`fictional-${id}-initial`);
    expect((await api("put",`/admin/api-keys/${id}`).send({key:`fictional-${id}-replacement`,label})).status).toBe(200);
  }
  invalidateApiKeyCache();
  for(const [id] of entries) expect((await getApiKey(id))?.key).toBe(`fictional-${id}-replacement`);
  const listed=await api("get","/admin/api-keys");
  expect(listed.body.providers).toHaveLength(4);
  for(const [id] of entries) {
    expect(listed.body.providers.find((p:any)=>p.id===id)?.source).toBe("firestore");
    expect(JSON.stringify(listed.body)).not.toContain(`fictional-${id}-replacement`);
  }
});
