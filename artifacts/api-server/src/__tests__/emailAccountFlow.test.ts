import {beforeEach, expect, it, vi} from "vitest";
import express from "express";
import request from "supertest";
const state=vi.hoisted(()=>({user:null as any,send:vi.fn(async()=>true)}));
vi.mock("../lib/firebaseAdmin.js",()=>({verifyIdToken:async()=>state.user,isFirebaseConfigured:()=>true,getFirestoreDb:()=>null}));
vi.mock("../lib/emailService.js",()=>({sendVerificationEmail:state.send,sendPasswordResetEmail:vi.fn(),sendWelcomeEmail:vi.fn(),sendTrackedEmail:vi.fn(),isResendConfigured:async()=>true}));
vi.mock("../lib/creditLedger.js",()=>({grantSignupBonus:vi.fn(),syncPaidProAccess:vi.fn()}));
vi.mock("../lib/rateLimiter.js",()=>({makeRateLimiter:()=> (_req:any,_res:any,next:any)=>next()}));
import auth from "../routes/auth.js";
const app=express().use(express.json()).use(auth);
const change=(email="new@example.test")=>request(app).post("/auth/change-email").set("Authorization","Bearer fixture").send({email});
beforeEach(()=>{vi.clearAllMocks();state.user={uid:"owner",email:"old@example.test",authTime:Date.now()/1000};});
it("requires a recent authenticated identity before issuing an email-change action",async()=>{
 state.user=null;expect((await change()).status).toBe(401);
 state.user={uid:"owner",authTime:Date.now()/1000-301};expect((await change()).status).toBe(403);
 expect(state.send).not.toHaveBeenCalled();
});
it("sends confirmation to the new address without changing the current identity",async()=>{
 expect((await change(" new@example.test ")).status).toBe(200);
 expect(state.send).toHaveBeenCalledWith("owner","new@example.test");
 expect(state.user.email).toBe("old@example.test");
});
it("rejects invalid or unchanged addresses and surfaces delivery failure",async()=>{
 expect((await change("invalid")).status).toBe(400);
 expect((await change("old@example.test")).status).toBe(400);
 state.send.mockRejectedValueOnce(Error("private provider failure"));
 const response=await change();expect(response.status).toBe(503);expect(response.text).not.toContain("private provider failure");
});
it("retires the redundant standalone welcome trigger",async()=>{
 expect((await request(app).post("/auth/welcome")).status).toBe(404);
});
