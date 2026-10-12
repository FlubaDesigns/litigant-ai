import {beforeEach,afterEach,expect,it,vi} from "vitest";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn(),isFirebaseConfigured:()=>true,verifyIdToken:async()=>({uid:"admin",admin:true})}));
vi.mock("../lib/flubaProviderKeys.js",()=>({readFlubaProviderKey:vi.fn(async(name:string)=>"central-fixture-"+name),clearFlubaProviderKeyCache:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getApiKey} from "../lib/apiKeyStore.js";
import adminRouter from "../routes/admin.js";
const app=express().use(express.json()).use(adminRouter);
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("OPENAI_API_KEY","revoked-deployment-fixture");});
afterEach(()=>vi.unstubAllEnvs());
const api=(method:"get"|"put"|"delete",path:string)=>request(app)[method](path).set("Authorization","Bearer test");
it("lists central credential metadata without reading the retired database or disclosing values",async()=>{
 const response=await api("get","/admin/api-keys");expect(response.status).toBe(200);
 expect(response.body.providers).toHaveLength(4);
 expect(response.body.providers.every((p:any)=>p.source==='fluba'&&p.maskedKey==='Managed in Fluba')).toBe(true);
 expect(JSON.stringify(response.body)).not.toContain('central-fixture-');
 expect(getFirestoreDb).not.toHaveBeenCalled();
});
it.each(['openai','anthropic','grok','gemini'])("cannot reinstate a local override for %s",async id=>{
 expect((await api('put','/admin/api-keys/'+id).send({key:'retired-local-fixture'})).status).toBe(409);
 expect((await api('delete','/admin/api-keys/'+id)).status).toBe(409);
 expect((await getApiKey(id))?.key).toMatch(/^central-fixture-/);
 expect(getFirestoreDb).not.toHaveBeenCalled();
});
