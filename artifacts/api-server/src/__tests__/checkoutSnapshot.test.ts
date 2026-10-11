import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js", () => ({
  getFirestoreDb: vi.fn(),
  isFirebaseConfigured: vi.fn(() => true),
  verifyIdToken: async () => ({ uid: "buyer" }),
}));
vi.mock("../lib/squareClient.js", () => ({
  isSquareConfigured: () => true,
  getSquareLocationId: () => "location-1",
  createPaymentLink: vi.fn(),
}));
vi.mock("../lib/autoRefill.js", () => ({
  validateRefillPayment: vi.fn(async () => null),
  recordRefillPayment: vi.fn(),
  getAutoRefillStatus: vi.fn(),
  removeAutoRefillCard: vi.fn(),
}));
vi.mock("../lib/emailService.js", () => ({
  isResendConfigured: () => true,
  sendPaymentReceiptEmail: vi.fn(async () => {}),
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { createPaymentLink } from "../lib/squareClient.js";
import { sendPaymentReceiptEmail } from "../lib/emailService.js";
import {
  getAllCreditPacks,
  invalidateCreditPacksCache,
} from "../lib/creditPacksConfig.js";
import { handleSquareEvent } from "../lib/squareEventHandler.js";
import billingRouter from "../routes/billing.js";
import webhookRouter from "../routes/webhook.js";
const app = express()
  .use(
    express.json({
      verify: (req, _res, bytes) => {
        (req as any).rawBody = bytes.toString();
      },
    }),
  )
  .use(billingRouter)
  .use(webhookRouter);
const pack = (credits = 500, cents = 499) => ({
  id: "offer_pack",
  name: "Offer",
  description: "Offer",
  active: true,
  metadata: { type: "credit_pack", creditAmount: String(credits) },
  prices: [
    {
      id: "price_offer",
      product: "offer_pack",
      unit_amount: cents,
      currency: "usd",
      recurring: null,
      active: true,
      metadata: { creditAmount: String(credits) },
    },
  ],
});
/** Offline create-only Firestore double with serializable atomic transactions. */
function database() {
  const store: Record<string, any> = {
    "config/creditPacks": { packs: { offer_pack: pack() } },
    "users/buyer": { creditBalance: 25, plan: "free" },
  };
  let lock = Promise.resolve(),
    nextId = 0;
  const fail = { read: false, create: false, commit: false, configRead: false };
  const ref = (path: string): any => ({
    path,
    get: async () => {
      if (fail.read || (fail.configRead && path === "config/creditPacks"))
        throw Error("Offline read failure");
      return {
        exists: path in store,
        data: () => structuredClone(store[path]),
      };
    },
    create: async (data: any) => {
      if (fail.create) throw Error("Offline create failure");
      if (path in store) throw Error("Already exists");
      store[path] = { ...data };
    },
  });
  return {
    store,
    fail,
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id ?? `auto-${++nextId}`}`),
    }),
    runTransaction: <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const run = lock.then(async () => {
        const writes: Array<() => void> = [];
        const result = await fn({
          get: (doc: any) => {
            if (writes.length) throw Error("Read after write");
            return doc.get();
          },
          set: (doc: any, data: any, opts?: any) =>
            writes.push(() => {
              store[doc.path] = opts?.merge
                ? { ...store[doc.path], ...data }
                : { ...data };
            }),
          create: (doc: any, data: any) => {
            if (doc.path in store) throw Error("Already exists");
            writes.push(() => {
              store[doc.path] = { ...data };
            });
          },
        });
        if (fail.commit) {
          fail.commit = false;
          throw Error("Offline commit failure");
        }
        writes.forEach((write) => write());
        return result;
      });
      lock = run.then(
        () => {},
        () => {},
      );
      return run;
    },
  };
}
let db: ReturnType<typeof database>;
const checkout = () =>
  request(app)
    .post("/billing/checkout")
    .set("Authorization", "Bearer fixture")
    .send({ priceId: "price_offer" });
const payment = (overrides: Record<string, unknown> = {}) => ({
  id: "payment-1",
  status: "COMPLETED",
  order_id: "order-1",
  location_id: "location-1",
  note: vi.mocked(createPaymentLink).mock.calls.at(-1)?.[0].note,
  amount_money: { amount: 499, currency: "USD" },
  ...overrides,
});
const event = (value = payment(), eventId = "event-1") => ({
  merchant_id: "merchant-1",
  type: "payment.updated",
  event_id: eventId,
  data: { object: { payment: value } },
});
const ledgers = () =>
  Object.entries(db.store).filter(([key]) =>
    key.startsWith("credit_transactions/"),
  );
const unchanged = () => {
  expect(db.store["users/buyer"]).toEqual({ creditBalance: 25, plan: "free" });
  expect(ledgers()).toHaveLength(0);
  expect(sendPaymentReceiptEmail).not.toHaveBeenCalled();
};
const signedWebhook = (value: ReturnType<typeof event>) => {
  const body = JSON.stringify(value),
    signature = crypto
      .createHmac("sha256", "fixture-signing-key")
      .update("https://example.invalid/api-server/api/square/webhook" + body)
      .digest("base64");
  return request(app)
    .post("/square/webhook")
    .set("Content-Type", "application/json")
    .set("x-square-hmacsha256-signature", signature)
    .send(body);
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("External network forbidden in checkout tests");
    }),
  );
  vi.stubEnv("APP_DOMAIN", "example.invalid");
  vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "fixture-signing-key");
  vi.mocked(isFirebaseConfigured).mockReturnValue(true);
  db = database();
  vi.mocked(getFirestoreDb).mockReturnValue(db as any);
  vi.mocked(createPaymentLink).mockResolvedValue({
    id: "link-1",
    order_id: "order-1",
    url: "https://example.invalid/pay",
  });
  invalidateCreditPacksCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("immutable checkout terms", () => {
  it("saves server-owned terms and provider binding before exposing the URL", async () => {
    const result = await request(app)
      .post("/billing/checkout")
      .set("Authorization", "Bearer fixture")
      .send({
        priceId: "price_offer",
        creditAmount: 999999,
        amountCents: 1,
        userId: "attacker",
        plan: "team",
      });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ url: "https://example.invalid/pay" });
    expect(db.store["checkout_snapshots/order-1"]).toMatchObject({
      version: 1,
      userId: "buyer",
      packId: "offer_pack",
      priceId: "price_offer",
      amountCents: 499,
      currency: "USD",
      creditAmount: 500,
      benefits: { plan: "pro" },
      orderId: "order-1",
      paymentLinkId: "link-1",
      locationId: "location-1",
    });
    expect(db.store["checkout_snapshots/order-1"].note).toBe(payment().note);
    unchanged();
  });
  it.each(["price", "credits", "disable", "delete", "catalogue outage"])(
    "honors captured terms after %s changes",
    async (change) => {
      expect((await checkout()).status).toBe(200);
      const saved = db.store["checkout_snapshots/order-1"];
      if (change === "price")
        db.store["config/creditPacks"].packs.offer_pack.prices[0].unit_amount =
          999;
      if (change === "credits")
        db.store["config/creditPacks"].packs.offer_pack = pack(900, 499);
      if (change === "disable")
        db.store["config/creditPacks"].packs.offer_pack.active = false;
      if (change === "delete")
        delete db.store["config/creditPacks"].packs.offer_pack;
      if (change === "catalogue outage") db.fail.configRead = true;
      invalidateCreditPacksCache();
      expect((await signedWebhook(event())).status).toBe(200);
      expect(db.store["users/buyer"]).toMatchObject({
        creditBalance: 525,
        plan: "pro",
      });
      expect(ledgers()).toHaveLength(1);
      expect(db.store["checkout_snapshots/order-1"]).toEqual(saved);
      expect(sendPaymentReceiptEmail).toHaveBeenCalledOnce();
    },
  );
  it("captures terms before an in-flight provider call observes a catalogue edit", async () => {
    vi.mocked(createPaymentLink).mockImplementationOnce(async () => {
      db.store["config/creditPacks"].packs.offer_pack = pack(700, 999);
      return {
        id: "link-1",
        order_id: "order-1",
        url: "https://example.invalid/pay",
      };
    });
    await checkout();
    await handleSquareEvent(event());
    expect(db.store["users/buyer"].creditBalance).toBe(525);
  });
  it.each([100001, 1000000])(
    "honors %i credits inside existing admin bounds",
    async (credits) => {
      db.store["config/creditPacks"].packs.offer_pack = pack(credits, 10000);
      expect((await checkout()).status).toBe(200);
      await handleSquareEvent(
        event(payment({ amount_money: { amount: 10000, currency: "USD" } })),
      );
      expect(db.store["users/buyer"].creditBalance).toBe(credits + 25);
    },
  );
  it.each([
    "write failure",
    "missing order",
    "missing link",
    "duplicate order",
  ])("never exposes a payable URL on %s", async (failure) => {
    if (failure === "write failure") db.fail.create = true;
    if (failure === "missing order")
      vi.mocked(createPaymentLink).mockResolvedValueOnce({
        id: "link-1",
        order_id: "",
        url: "https://example.invalid/pay",
      });
    if (failure === "missing link")
      vi.mocked(createPaymentLink).mockResolvedValueOnce({
        id: "",
        order_id: "order-1",
        url: "https://example.invalid/pay",
      });
    if (failure === "duplicate order")
      expect((await checkout()).status).toBe(200);
    const original = db.store["checkout_snapshots/order-1"],
      result = await checkout();
    expect(result.status).toBe(500);
    expect(result.body.url).toBeUndefined();
    expect(db.store["checkout_snapshots/order-1"]).toBe(original);
    unchanged();
  });
  it("does not create a Square link without snapshot storage", async () => {
    await getAllCreditPacks();
    vi.mocked(getFirestoreDb).mockReturnValue(null);
    expect((await checkout()).status).toBe(500);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });
  it.each([
    ["excessive credits", { metadata: { creditAmount: "1000001" } }],
    ["fractional credits", { metadata: { creditAmount: "12.5" } }],
    ["invalid credit syntax", { metadata: { creditAmount: "500bad" } }],
    ["unsupported currency", { currency: "EUR" }],
    ["fractional cents", { unit_amount: 499.5 }],
  ])("rejects %s before contacting Square", async (_name, patch) => {
    Object.assign(
      db.store["config/creditPacks"].packs.offer_pack.prices[0],
      patch,
    );
    expect((await checkout()).status).toBe(500);
    expect(createPaymentLink).not.toHaveBeenCalled();
    unchanged();
  });
});

describe("verified atomic fulfillment", () => {
  it.each([
    undefined,
    "",
    "Other checkout",
    "LITIGANT:userId=buyer,creditAmount=bad,pack=offer_pack",
  ])(
    "keeps a known completed order retryable when its note is missing or malformed: %s",
    async (note) => {
      await checkout();
      expect((await signedWebhook(event(payment({ note })))).status).toBe(500);
      unchanged();
    },
  );
  it("ignores an unrelated completed Square payment without a saved order", async () => {
    expect(
      (
        await signedWebhook(
          event(payment({ order_id: "unrelated-order", note: "Other sale" })),
        )
      ).status,
    ).toBe(200);
    unchanged();
  });

  it.each([
    ["underpayment", { amount_money: { amount: 498, currency: "USD" } }],
    ["overpayment", { amount_money: { amount: 504, currency: "USD" } }],
    ["missing amount", { amount_money: { currency: "USD" } }],
    ["wrong currency", { amount_money: { amount: 499, currency: "EUR" } }],
    ["missing currency", { amount_money: { amount: 499 } }],
    ["wrong order", { order_id: "other-order" }],
    ["missing order", { order_id: undefined }],
    ["wrong location", { location_id: "other-location" }],
    ["missing location", { location_id: undefined }],
    ["missing payment ID", { id: undefined }],
  ])("rejects %s without credits or benefits", async (_name, patch) => {
    await checkout();
    await expect(handleSquareEvent(event(payment(patch)))).rejects.toThrow();
    unchanged();
  });
  it.each(["user", "credits", "pack", "checkout", "removed marker"])(
    "rejects a changed %s note field",
    async (field) => {
      await checkout();
      let note = payment().note!;
      if (field === "user") note = note.replace("userId=buyer", "userId=other");
      if (field === "credits")
        note = note.replace("creditAmount=500", "creditAmount=900");
      if (field === "pack")
        note = note.replace("pack=offer_pack", "pack=other");
      if (field === "checkout")
        note = note.replace(/checkout=.*/, "checkout=other");
      if (field === "removed marker") note = note.replace(/,checkout=.*/, "");
      await expect(handleSquareEvent(event(payment({ note })))).rejects.toThrow(
        /saved checkout terms/,
      );
      unchanged();
      expect(db.store["users/other"]).toBeUndefined();
    },
  );
  it.each([
    "missing snapshot",
    "unreadable snapshot",
    "corrupt snapshot",
    "Firebase unavailable",
  ])("returns retryable HTTP 500 for %s", async (failure) => {
    await checkout();
    if (failure === "missing snapshot")
      delete db.store["checkout_snapshots/order-1"];
    if (failure === "unreadable snapshot") db.fail.read = true;
    if (failure === "corrupt snapshot")
      db.store["checkout_snapshots/order-1"].benefits.plan = "team";
    if (failure === "Firebase unavailable")
      vi.mocked(isFirebaseConfigured).mockReturnValue(false);
    expect((await signedWebhook(event())).status).toBe(500);
    unchanged();
  });
  it("rejects a forged signature before fulfillment", async () => {
    await checkout();
    expect(
      (
        await request(app)
          .post("/square/webhook")
          .set("x-square-hmacsha256-signature", "forged")
          .send(event())
      ).status,
    ).toBe(401);
    unchanged();
  });
  it("grants once across ten concurrent, distinct event IDs", async () => {
    await checkout();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        handleSquareEvent(event(payment(), `event-${i}`)),
      ),
    );
    expect(db.store["users/buyer"]).toMatchObject({
      creditBalance: 525,
      plan: "pro",
    });
    expect(ledgers()).toHaveLength(1);
    expect(db.store["payment_events/payment_payment-1"]).toMatchObject({
      uid: "buyer",
      amount: 500,
    });
    expect(db.store["checkout_fulfillments/order-1"]).toMatchObject({
      paymentId: "payment-1",
      uid: "buyer",
      amount: 500,
    });
    expect(sendPaymentReceiptEmail).toHaveBeenCalledOnce();
  });
  it("refuses to consume one checkout using two different payment IDs", async () => {
    await checkout();
    const results = await Promise.allSettled([
      handleSquareEvent(event()),
      handleSquareEvent(event(payment({ id: "payment-2" }), "event-2")),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(db.store["users/buyer"].creditBalance).toBe(525);
    expect(ledgers()).toHaveLength(1);
  });
  it("rolls back the order claim, payment dedup, credits and benefits together, then retries", async () => {
    await checkout();
    db.fail.commit = true;
    expect((await signedWebhook(event())).status).toBe(500);
    unchanged();
    expect(db.store["checkout_fulfillments/order-1"]).toBeUndefined();
    expect(db.store["payment_events/payment_payment-1"]).toBeUndefined();
    expect((await signedWebhook(event())).status).toBe(200);
    expect(db.store["users/buyer"]).toMatchObject({
      creditBalance: 525,
      plan: "pro",
    });
    expect(ledgers()).toHaveLength(1);
  });
});

describe("already-issued legacy links", () => {
  const legacy = () =>
    payment({
      note: "LITIGANT:userId=buyer,creditAmount=500,pack=offer_pack",
      order_id: "legacy-order",
    });
  it("fulfills verifiable legacy terms after the pack is disabled", async () => {
    db.store["config/creditPacks"].packs.offer_pack.active = false;
    expect((await signedWebhook(event(legacy()))).status).toBe(200);
    expect(db.store["users/buyer"]).toMatchObject({
      creditBalance: 525,
      plan: "pro",
    });
  });
  it.each([
    "price edit",
    "credit edit",
    "deleted pack",
    "absent pack metadata",
    "invalid currency",
  ])(
    "leaves %s retryable for reconciliation without inventing terms",
    async (change) => {
      if (change === "price edit")
        db.store["config/creditPacks"].packs.offer_pack = pack(500, 999);
      if (change === "credit edit")
        db.store["config/creditPacks"].packs.offer_pack = pack(900, 499);
      if (change === "deleted pack")
        delete db.store["config/creditPacks"].packs.offer_pack;
      const paid = legacy();
      if (change === "absent pack metadata")
        paid.note = "LITIGANT:userId=buyer,creditAmount=500";
      if (change === "invalid currency") paid.amount_money.currency = "EUR";
      expect((await signedWebhook(event(paid))).status).toBe(500);
      unchanged();
      expect(db.store["checkout_snapshots/legacy-order"]).toBeUndefined();
    },
  );
});
