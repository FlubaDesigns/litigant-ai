import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { accountDeletionDatabase } from "./accountDeletionDatabase.js";
vi.mock("../lib/firebaseAdmin.js", () => ({ getFirestoreDb: vi.fn(), isFirebaseConfigured: () => true, verifyIdToken: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
vi.mock("../lib/squareClient.js", () => ({ isSquareConfigured: () => true, disableSquareCard: vi.fn(),
  getSquareLocationId: () => "offline", getSquarePayment: vi.fn(), findSquareRefillPayment: vi.fn(), chargeSquareCard: vi.fn(),
  createSquareCustomer: vi.fn(), saveSquareCard: vi.fn(), SquareApiError: class extends Error {} }));
vi.mock("../lib/emailService.js", () => ({ sendTrackedEmail: vi.fn(), sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(), isResendConfigured: () => false }));
vi.mock("../lib/rateLimiter.js", () => ({ makeRateLimiter: () => (_req:any, _res:any, next:any) => next() }));
vi.mock("../lib/billingDefaultsConfig.js", () => ({ getBillingDefaults: async () => ({ signupBonusCredits: 500 }) }));
import { getFirestoreDb, verifyIdToken } from "../lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";
import { chargeSquareCard, disableSquareCard, getSquarePayment, saveSquareCard, createSquareCustomer } from "../lib/squareClient.js";
import { grantSignupBonus, reserveCredits, addCredits } from "../lib/creditLedger.js";
import { reserveCreditRun } from "../lib/creditRunSettlement.js";
import { checkAndTriggerAutoRefill, setAutoRefillPreference, recordRefillPayment } from "../lib/autoRefill.js";
import account from "../routes/account.js";
import auth from "../routes/auth.js";
const app = express().use(express.json()).use(account).use(auth);
let db: ReturnType<typeof accountDeletionDatabase>;
const deleteUser = vi.fn();
const remove = () => request(app).delete("/account").set("Authorization", "Bearer offline-owner");
const provision = () => request(app).post("/auth/provision").set("Authorization", "Bearer offline-owner").send({});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live network forbidden"); }));
  db = accountDeletionDatabase({
    "users/u": { plan: "pro", email: "offline@example.invalid", creditBalance: 500, autoRefill: { enabled: true, consentVersion: 1, thresholdCredits: 600, dollarAmount: 20 } },
    "billing_accounts/u": { cardId: "offline-card" },
    "sessions/s": { userId: "u" }, "sessions/s/session_turns/t": { content: "offline" },
    "credit_transactions/c": { userId: "u", amount: 500, type: "signup_bonus" },
    "feedback/f": { userId: "u" }, "api_logs/l": { userId: "u" },
    "payment_events/signup_bonus_u": { uid: "u", eventType: "signup_bonus" },
    "users/other": { creditBalance: 99 }, "sessions/other": { userId: "other" },
  });
  vi.mocked(getFirestoreDb).mockReturnValue(db as any);
  vi.mocked(verifyIdToken).mockResolvedValue({ uid: "u", emailVerified: true });
  vi.mocked(getAuth).mockReturnValue({ deleteUser } as any);
  deleteUser.mockImplementation(async () => { vi.mocked(verifyIdToken).mockResolvedValue(null); });
});
describe("truthful owner account deletion", () => {
  it("confirms completion only after data, Auth and temporary state are removed", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, authDeleted: true, appDataDeleted: true, phase: "complete" });
    expect(deleteUser).toHaveBeenCalledWith("u");
    expect(Object.keys(db.store).sort()).toEqual(["payment_events/signup_bonus_u", "sessions/other", "users/other"]);
    expect(chargeSquareCard).not.toHaveBeenCalled();
  });
  it("treats Auth user-not-found as confirmed absent", async () => {
    deleteUser.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await remove()).body).toMatchObject({ success: true, authDeleted: true });
  });
  it("keeps missing-profile Auth failure retryable without provisioning or charging", async () => {
    deleteUser.mockRejectedValueOnce({ code: "auth/insufficient-permission", message: "secret detail" });
    const failed = await remove();
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ success: false, appDataDeleted: true, authDeleted: false, retryable: true, phase: "auth" });
    expect(JSON.stringify(failed.body)).not.toContain("secret detail");
    expect(db.store["users/u"]).toBeUndefined();
    expect((await provision()).body).toMatchObject({ provisioned: true, deletionPending: true, bonusGranted: false });
    expect(db.store["users/u"]).toBeUndefined();
    expect((await remove()).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(2);
    expect(chargeSquareCard).not.toHaveBeenCalled();
    expect(disableSquareCard).toHaveBeenCalledTimes(1);
  });
  it.each(["sessions/s/session_turns/t", "sessions/s", "credit_transactions/c", "feedback/f", "api_logs/l"])("reports partial failure at %s and safely resumes", async path => {
    db.failDirectWhen((kind, target) => kind === "delete" && target === path);
    const failed = await remove();
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ success: false, phase: "data", appDataDeleted: false, authDeleted: false, retryable: true });
    expect(failed.body.message).toContain("Some data may already have been removed");
    expect(deleteUser).not.toHaveBeenCalled();
    db.failDirectWhen();
    expect((await remove()).status).toBe(200);
    expect(chargeSquareCard).not.toHaveBeenCalled();
  });
  it("reports cleanup failure after Auth removal as manual support", async () => {
    db.failTransactionsWhen(writes => writes.some(w => w.path === "account_deletions/u" && w.data === null));
    const response = await remove();
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, code: "cleanup_required", authDeleted: true, appDataDeleted: true, retryable: false });
    expect(db.store["account_deletions/u"]).toBeDefined();
  });
  it("does not delete Auth if atomic profile cleanup fails", async () => {
    db.failTransactionsWhen(writes => writes.some(w => w.path === "users/u" && w.data === null));
    const response = await remove();
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ appDataDeleted: false, authDeleted: false });
    expect(db.store["users/u"]).toBeDefined();
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("serializes duplicate delete requests", async () => {
    let finish!: () => void;
    deleteUser.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = remove().then(r => r);
    await vi.waitFor(() => expect(deleteUser).toHaveBeenCalledTimes(1));
    expect((await remove()).body.code).toBe("deletion_in_progress");
    finish();
    expect((await first).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });
  it("preserves unresolved run and payment guards with no new charge", async () => {
    db.store["credit_runs/r"] = { userId: "u", state: "active", leaseUntil: Date.now() + 60000 };
    expect((await remove()).body.code).toBe("settlement_pending");
    expect(db.store["sessions/s"]).toBeDefined();
    delete db.store["credit_runs/r"];
    db.store["billing_accounts/u"].activeAttempt = "pending";
    db.store["auto_refill_attempts/pending"] = { uid: "u", status: "pending", leaseUntil: Date.now() + 60000 };
    expect((await remove()).body.code).toBe("payment_pending");
    expect(deleteUser).not.toHaveBeenCalled();
    expect(chargeSquareCard).not.toHaveBeenCalled();
  });
  it.each([true, false])("blocks provisioning and credits while deletion is pending, prior bonus=%s", async hadBonus => {
    if (!hadBonus) delete db.store["payment_events/signup_bonus_u"];
    db.store["account_deletions/u"] = { phase: "preparing", appDataDeleted: false, leaseUntil: 0 };
    expect((await provision()).body).toMatchObject({ deletionPending: true, bonusGranted: false });
    expect((await grantSignupBonus("u", { emailVerified: true })).skipped).toBe(true);
    expect(await reserveCredits("u", 10, "new")).toBe(false);
    expect(await reserveCreditRun("u", 10, "new", "run")).toBe(false);
    await checkAndTriggerAutoRefill("u", 0, "new");
    expect(chargeSquareCard).not.toHaveBeenCalled();
    await expect(setAutoRefillPreference("u", { enabled: true, consent: true, thresholdCredits: 100, dollarAmount: 20 })).rejects.toThrow("deletion");
    expect(db.store["users/u"].creditBalance).toBe(500);
  });
  it("never grants late payments into an erased or erasing profile", async () => {
    db.store["account_deletions/u"] = { phase: "data", appDataDeleted: false };
    await expect(addCredits("u", 500, "purchase")).rejects.toThrow("deletion");
    delete db.store["account_deletions/u"]; delete db.store["users/u"];
    await expect(addCredits("u", 500, "purchase")).rejects.toThrow("unavailable");
    expect(db.store["users/u"]).toBeUndefined();
  });
  it("rejects unauthorized requests without mutation", async () => {
    const initial = structuredClone(db.store);
    expect((await request(app).delete("/account")).status).toBe(401);
    vi.mocked(verifyIdToken).mockResolvedValue(null);
    expect((await remove()).status).toBe(401);
    expect(db.store).toEqual(initial);
  });
});


describe("late writes cannot recreate an erased account", () => {
  const cardPayment=()=>({id:"manual",status:"COMPLETED",location_id:"offline",note:"LITIGANT:userId=u,creditAmount=500,pack=starter",created_at:new Date().toISOString(),card_details:{status:"CAPTURED",entry_method:"KEYED",card:{card_brand:"VISA",last_4:"1111"}}});
  it("ignores duplicate completed card metadata after deletion", async () => {
    expect((await remove()).status).toBe(200);
    await recordRefillPayment("u",cardPayment());
    expect(db.store["users/u"]).toBeUndefined();expect(db.store["billing_accounts/u"]).toBeUndefined();
  });
  it("does not restore disabled preferences when deletion wins between preflight and transaction", async () => {
    const transaction=db.runTransaction;
    db.runTransaction=async (callback:any)=>{
      delete db.store["users/u"];
      return transaction(callback);
    };
    await expect(setAutoRefillPreference("u",{enabled:false,thresholdCredits:100,dollarAmount:20})).rejects.toThrow("unavailable");
    expect(db.store["users/u"]).toBeUndefined();
  });
  it("disables a newly saved card if deletion wins during the external save", async () => {
    db.store["billing_accounts/u"]={recentCardPayment:{id:"manual"}};
    vi.mocked(getSquarePayment).mockResolvedValue(cardPayment());
    vi.mocked(createSquareCustomer).mockResolvedValue({id:"customer"});
    vi.mocked(saveSquareCard).mockImplementation(async()=>{
      db.store["account_deletions/u"]={phase:"data",appDataDeleted:false};
      delete db.store["users/u"];delete db.store["billing_accounts/u"];
      return {id:"new-card"};
    });
    await expect(setAutoRefillPreference("u",{enabled:true,consent:true,thresholdCredits:100,dollarAmount:20})).rejects.toThrow("unavailable");
    expect(disableSquareCard).toHaveBeenCalledWith("new-card");
    expect(db.store["users/u"]).toBeUndefined();expect(db.store["billing_accounts/u"]).toBeUndefined();
  });
  it("provision races with deletion without restoring profile or granting a first bonus", async () => {
    delete db.store["payment_events/signup_bonus_u"];
    await Promise.all([remove(),provision()]);
    expect(db.store["users/u"]).toBeUndefined();
    expect(chargeSquareCard).not.toHaveBeenCalled();
  });
});


it("rejects a provision request paused after verification until deletion finishes", async () => {
  const transaction = db.runTransaction;
  let resume!: () => void;
  let paused!: () => void;
  const entered = new Promise<void>(resolve => { paused=resolve; });
  const wait = new Promise<void>(resolve => { resume=resolve; });
  let first = true;
  db.runTransaction = async (callback:any) => {
    if (first) { first=false; paused(); await wait; }
    return transaction(callback);
  };
  const delayed = provision().then(response=>response);
  await entered;
  expect((await remove()).status).toBe(200);
  resume();
  const response = await delayed;
  expect(response.status).toBe(401);
  expect(db.store["users/u"]).toBeUndefined();
  expect(db.store["account_deletions/u"]).toBeUndefined();
});
