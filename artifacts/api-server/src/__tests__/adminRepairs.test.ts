import {beforeEach, expect, it, vi} from "vitest";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb: vi.fn(), isFirebaseConfigured: () => true, verifyIdToken: async () => ({uid: "owner", admin: true})}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {sendTrackedEmail, eligibleForReengagement} from "../lib/emailService.js";
import adminRouter from "../routes/admin.js";
import {grantSignupBonus} from "../lib/creditLedger.js";
import {getTemplate} from "../lib/templateStore.js";
const app = express().use(express.json()).use(adminRouter);
let store: Record<string, any>;
let failCollection: string | undefined;

// Serializable transaction fixture: failed callbacks cannot commit, and reads
// after writes fail just as they do in Firestore.
beforeEach(() => {
  store = {"users/u": {creditBalance: 100}, "sessions/s": {status: "complete"},
    "credit_transactions/charge": {userId: "u", type: "usage", amount: -100, sessionId: "s"}};
  failCollection = undefined;
  let counter = 0;
  let lock = Promise.resolve();
  function doc(path: string): any {
    return {path, id: path.split("/").at(-1), get: async () => ({id: path.split("/").at(-1), exists: !!store[path], data: () => store[path], ref: doc(path)}),
      set: async (data: any, options?: any) => {store[path] = options?.merge ? {...store[path], ...data} : data;},
      update: async (data: any) => {store[path] = {...store[path], ...data};}};
  }
  function collection(name: string, filters: any[] = [], order: any = "__name__", direction = "asc", after?: any, size = Infinity): any {
    const query = {
      doc: (id = `generated-${++counter}`) => doc(`${name}/${id}`),
      where: (field: string, op: string, value: any) => collection(name, [...filters, [field, op, value]], order, direction, after, size),
      orderBy: (field: any, dir = "asc") => collection(name, filters, typeof field === "string" ? field : "__name__", dir, after, size),
      startAfter: (cursor: any) => collection(name, filters, order, direction, cursor, size),
      limit: (n: number) => collection(name, filters, order, direction, after, n),
      get: async () => {
        if (failCollection === name) throw new Error("Read failed");
        let rows = Object.entries(store).filter(([path]) => path.startsWith(name + "/") && path.split("/").length === 2)
          .map(([path, value]) => ({id: path.split("/")[1]!, value, ref: doc(path)}));
        for (const [field, op, value] of filters) rows = rows.filter(row => op === "==" ? row.value[field] === value : row.value[field] > value);
        const getValue = (row: any) => order === "__name__" ? row.id : row.value[order];
        rows.sort((a, b) => (getValue(a) < getValue(b) ? -1 : getValue(a) > getValue(b) ? 1 : 0) * (direction === "asc" ? 1 : -1));
        if (after) rows = rows.slice(rows.findIndex(row => row.id === (typeof after === "string" ? after : after.id)) + 1);
        rows = rows.slice(0, size);
        return {size: rows.length, docs: rows.map(row => ({id: row.id, data: () => row.value, ref: row.ref}))};
      },
    };
    return query;
  }
  vi.mocked(getFirestoreDb).mockReturnValue({collection,
    runTransaction: (fn: any) => {
      const result = lock.then(async () => {
        const pending: Array<() => Promise<void>> = [];
        const value = await fn({get: (ref: any) => {if (pending.length) throw new Error("Read after write"); return ref.get();},
          set: (ref: any, data: any, options?: any) => pending.push(() => ref.set(data, options)),
          update: (ref: any, data: any) => pending.push(() => ref.update(data))});
        for (const write of pending) await write();
        return value;
      });
      lock = result.then(() => undefined, () => undefined);
      return result;
    },
  } as any);
});
const read = (path: string) => request(app).get(`/admin/${path}`).set("Authorization", "Bearer fixture");
const refund = (amount: any, requestId = "request-number-one", extra = {}) => request(app).post("/admin/credits/refund").set("Authorization", "Bearer fixture")
  .send({userId: "u", transactionId: "charge", amount, requestId, ...extra});

it("refunds only the remaining collected credits and deduplicates a retried request", async () => {
  store["credit_transactions/reconciled"] = {userId: "u", type: "refund", amount: 70, sessionId: "s", source: "brain_reconcile"};
  expect((await refund(31)).status).toBe(400);
  expect((await refund(30)).status).toBe(200);
  expect((await refund(30)).body.skipped).toBe(true);
  expect((await refund(1, "request-number-two")).status).toBe(400);
  expect(store["users/u"].creditBalance).toBe(130);
});
it("serializes competing refunds without over-refunding", async () => {
  const results = await Promise.all([refund(60), refund(60, "request-number-two")]);
  expect(results.map(r => r.status).sort()).toEqual([200, 400]);
  expect(store["users/u"].creditBalance).toBe(160);
});
it.each(["30", 1.5, 0, -1, null])("rejects invalid refund amount %s without changing the balance", async amount => {
  expect((await refund(amount)).status).toBe(400);
  expect(store["users/u"].creditBalance).toBe(100);
});
it("does not refund uncollected shortfalls, another user's charge, or an active run", async () => {
  store["credit_transactions/shortfall"] = {userId: "u", type: "usage_shortfall", amount: 0};
  expect((await refund(10, undefined, {transactionId: "shortfall"})).status).toBe(400);
  expect((await refund(10, undefined, {userId: "someone-else"})).status).toBe(400);
  store["sessions/s"].activeRun = {id: "run", expiresAt: Date.now() + 60000};
  expect((await refund(10)).status).toBe(400);
});
it("searches beyond 200 accounts and returns distinct pages for mixed-case name/email matches", async () => {
  for (let i = 0; i < 550; i++) store[`users/${String(i).padStart(3, "0")}`] = {displayName: "Someone", createdAt: i};
  for (const id of ["001", "300", "549"]) store[`users/${id}`].email = "Dave@EXAMPLE.test";
  const first = await read("users?search=dave%40example.test&limit=2");
  expect(first.body.users.map((user: any) => user.id)).toEqual(["001", "300"]);
  const second = await read(`users?search=dave%40example.test&limit=2&cursor=${first.body.nextCursor}`);
  expect(second.body.users.map((user: any) => user.id)).toEqual(["549"]);
  expect(second.body.hasMore).toBe(false);
  store["users/001"].displayName = "David";
  expect((await read("users?search=david")).body.users[0].id).toBe("001");
});
it("can retrieve invitations older than the first page", async () => {
  for (let i = 0; i < 52; i++) store[`guest_invitations/i${i}`] = {label: `Guest ${i}`, credits: 100, plan: "free", createdAt: i, expiresAt: {toDate: () => new Date(Date.now()+86400_000), toMillis: () => Date.now()+86400_000}};
  const first = await read("guest-invitations");
  expect(first.body.invitations).toHaveLength(50);
  const second = await read(`guest-invitations?cursor=${first.body.nextCursor}`);
  expect(second.body.invitations).toHaveLength(2);
  expect(second.body.hasMore).toBe(false);
});
it("persists editable questions and output defaults into the template used by execution", async () => {
  const inputFields = [{id: "goal", label: "What is your goal?", placeholder: "Describe it", type: "textarea", required: true}];
  const result = await request(app).put("/admin/templates/business-plan").set("Authorization", "Bearer fixture")
    .send({title: "Business plan", inputFields, defaultConfig: {artifactType: "memo", outputPreferenceMode: "document", format: "docx"}});
  expect(result.status).toBe(200);
  const template = await getTemplate("business-plan");
  expect(template?.inputFields).toEqual(inputFields);
  expect(template?.defaultConfig).toMatchObject({artifactType: "memo", format: "docx"});
  const invalid = await request(app).put("/admin/templates/business-plan").set("Authorization", "Bearer fixture").send({inputFields: [...inputFields, ...inputFields]});
  expect(invalid.status).toBe(400);
});
it("reports saved-template read failures instead of showing the stock catalogue as saved data", async () => {
  failCollection = "templates";
  expect((await read("templates")).status).toBe(500);
});
it("claims first-session email once under concurrent triggers", async () => {
  const deliver = vi.fn(async () => true);
  const results = await Promise.all([sendTrackedEmail("u", "firstSession", deliver, {sentField: "firstSessionEmailSent"}), sendTrackedEmail("u", "firstSession", deliver, {sentField: "firstSessionEmailSent"})]);
  expect(results.sort()).toEqual([false, true]);
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(store["users/u"].firstSessionEmailSent).toBe(true);
});
it("does not mark disabled emails sent, and retries failures with the same provider key", async () => {
  expect(await sendTrackedEmail("u", "welcome", async () => false, {sentField: "welcomeEmailSent"})).toBe(false);
  expect(store["users/u"].welcomeEmailSent).toBeUndefined();
  const attempts: string[] = [];
  await expect(sendTrackedEmail("u", "welcome", async key => {attempts.push(key); throw new Error("Provider unavailable");}, {sentField: "welcomeEmailSent"})).rejects.toThrow();
  expect(store["users/u"].welcomeEmailSent).toBeUndefined();
  await sendTrackedEmail("u", "welcome", async key => {attempts.push(key); return true;}, {sentField: "welcomeEmailSent"});
  expect(attempts[0]).toBe(attempts[1]);
  expect((await read("email-deliveries")).body.deliveries[0].status).toBe("accepted");
});
it("applies balance-email cooldown only after acceptance", async () => {
  const send = vi.fn(async () => true);
  const opts = {sentField: "lowCreditEmailSentAt", cooldownMs: 86400_000};
  await sendTrackedEmail("u", "lowCredits", send, opts);
  expect(await sendTrackedEmail("u", "lowCredits", send, opts)).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
});
it("excludes new, guest and banned users from re-engagement, including accounts with no sessions", () => {
  const now = Date.now(), cutoff = now - 14*86400_000;
  const base = {creditBalance: 50, createdAt: new Date(now - 30*86400_000)};
  expect(eligibleForReengagement(base, cutoff)).toBe(true);
  expect(eligibleForReengagement({...base, createdAt: new Date(now)}, cutoff)).toBe(false);
  expect(eligibleForReengagement({...base, lastSessionAt: now}, cutoff)).toBe(false);
  expect(eligibleForReengagement({...base, banned: true}, cutoff)).toBe(false);
  expect(eligibleForReengagement({...base, guestInvitationId: "trial"}, cutoff)).toBe(false);
  expect(eligibleForReengagement({...base, reengagementEmailSentAt: now}, cutoff)).toBe(false);
});

it("honors a zero signup bonus without blocking account provisioning", async () => {
  store["config/billingDefaults"] = {signupBonusCredits: 0};
  expect(await grantSignupBonus("u")).toEqual({skipped: false, amount: 0});
  expect(await grantSignupBonus("u")).toEqual({skipped: true, amount: 0});
  expect(store["users/u"].creditBalance).toBe(100);
});
