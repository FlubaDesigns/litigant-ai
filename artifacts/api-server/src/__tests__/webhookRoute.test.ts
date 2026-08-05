/**
 * Route-level integration tests for POST /api/square/webhook.
 *
 * Unlike the unit tests in squareWebhook.test.ts (which exercise the handler
 * logic in isolation), these tests send real HTTP requests through supertest so
 * we can verify that raw-body preservation, HMAC signature gating, and the
 * handler are all wired together correctly in the Express router.
 *
 * A misconfigured middleware (e.g. json() consuming rawBody before the
 * signature check) would pass unit tests but fail here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";
import crypto from "crypto";

// ── Module mocks (hoisted before any import) ──────────────────────────────────

vi.mock("../lib/firebaseAdmin.js", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getFirestoreDb: vi.fn(() => null),
  initFirebaseAdmin: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("../lib/creditLedger.js", () => ({
  addCredits: vi.fn(),
}));

vi.mock("../lib/creditPacksConfig.js", () => ({
  getAllCreditPacks: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../lib/emailService.js", () => ({
  isResendConfigured:      vi.fn(() => false),
  sendPaymentReceiptEmail: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import webhookRouter from "../routes/webhook.js";
import { addCredits } from "../lib/creditLedger.js";
import { getAllCreditPacks } from "../lib/creditPacksConfig.js";

// ── Test app factory ──────────────────────────────────────────────────────────

/**
 * Build a minimal Express app that replicates the rawBodySaver middleware from
 * app.ts and mounts the webhook router at /api, matching production wiring.
 */
function buildApp() {
  const app = express();

  // Mirrors the rawBodySaver in app.ts: preserve the raw buffer on req.rawBody
  // before JSON parsing so the HMAC check can read it.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString("utf8");
      },
    }),
  );

  app.use("/api", webhookRouter);
  return app;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGNING_KEY = "test-signing-key-abc123";
const APP_DOMAIN  = "example.com";
// Must match the URL the route constructs from APP_DOMAIN.
const NOTIFICATION_URL = `https://${APP_DOMAIN}/api-server/api/square/webhook`;

/** Build the Base64-encoded HMAC-SHA256 Square signature for rawBody. */
function makeSignature(rawBody: string, key = SIGNING_KEY): string {
  return crypto
    .createHmac("sha256", key)
    .update(NOTIFICATION_URL + rawBody)
    .digest("base64");
}

/** A minimal valid payment.updated event payload. */
function makePaymentEvent(overrides: Record<string, unknown> = {}) {
  return {
    merchant_id: "merchant-1",
    type:        "payment.updated",
    event_id:    "evt-001",
    data: {
      object: {
        payment: {
          id:           "pay-001",
          status:       "COMPLETED",
          note:         "LITIGANT:userId=user-1,creditAmount=1000,pack=starter_pack",
          amount_money: { amount: 1000, currency: "USD" },
          ...overrides,
        },
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/square/webhook — route-level", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();

    // Restore env before each test so individual tests can override cleanly.
    process.env = { ...originalEnv, SQUARE_WEBHOOK_SIGNATURE_KEY: SIGNING_KEY, APP_DOMAIN };

    // Default: pack catalogue returns a matching pack.
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "1000" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    // Default: addCredits succeeds with a fresh grant.
    vi.mocked(addCredits).mockResolvedValue({ newBalance: 1000, skipped: false });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Test 1: valid signature ────────────────────────────────────────────────

  it("returns 200 and calls addCredits when the HMAC signature is valid", async () => {
    const body = JSON.stringify(makePaymentEvent());
    const sig  = makeSignature(body);
    const app  = buildApp();

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
    expect(addCredits).toHaveBeenCalledOnce();
    expect(addCredits).toHaveBeenCalledWith(
      "user-1",
      1000,
      "purchase",
      expect.objectContaining({
        source:         "square_checkout",
        idempotencyKey: "payment_pay-001",
      }),
    );
  });

  // ── Test 2: invalid signature ──────────────────────────────────────────────

  it("returns 401 and does NOT call addCredits when the signature is wrong", async () => {
    const body = JSON.stringify(makePaymentEvent());
    const app  = buildApp();

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", "this-is-not-a-valid-hmac-signature")
      .send(body);

    expect(res.status).toBe(401);
    expect(addCredits).not.toHaveBeenCalled();
  });

  // ── Test 3: missing signature header ──────────────────────────────────────

  it("returns 400 and does NOT call addCredits when the signature header is absent", async () => {
    const body = JSON.stringify(makePaymentEvent());
    const app  = buildApp();

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      // Deliberately omit x-square-hmacsha256-signature
      .send(body);

    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  // ── Extra: rawBody is preserved correctly through JSON middleware ──────────

  it("correctly verifies the signature when rawBody is preserved by the middleware", async () => {
    // This test specifically guards against a regression where json() consumes
    // the body before the signature check can read it (req.rawBody would then
    // be undefined / empty, causing a false-negative HMAC mismatch).
    const payload = makePaymentEvent({ note: "LITIGANT:userId=user-2,creditAmount=500" });
    const body    = JSON.stringify(payload);
    const sig     = makeSignature(body);
    const app     = buildApp();

    vi.mocked(getAllCreditPacks).mockResolvedValue({});   // no packId in note → pack check skipped

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    // If rawBody was not preserved the signature would mismatch and we'd get 401.
    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalledOnce();
  });

  // ── Idempotency: duplicate webhook delivery must not grant credits twice ──────

  it("returns 200 for both deliveries but only grants credits on the first (idempotency guard)", async () => {
    // Square retries webhook delivery on non-2xx. Both deliveries must return
    // 200 so Square stops retrying, but the credit grant must fire only once.
    //
    // squareEventHandler passes idempotencyKey="payment_<id>" to addCredits.
    // addCredits writes that key to payment_events atomically on the first call
    // and returns { skipped: true } on subsequent calls with the same key.
    // This test exercises that contract at the route level.

    const body = JSON.stringify(makePaymentEvent());
    const sig  = makeSignature(body);
    const app  = buildApp();

    // First delivery: Firestore transaction succeeds → credits granted.
    vi.mocked(addCredits).mockResolvedValueOnce({ newBalance: 1000, skipped: false });
    // Second delivery: idempotency key already present → no balance mutation.
    vi.mocked(addCredits).mockResolvedValueOnce({ newBalance: 0, skipped: true });

    const first = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    const second = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    // Both responses must be 200 so Square stops retrying.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // addCredits is invoked for each delivery (the route always calls it),
    // but only the FIRST call produces a real credit grant.
    expect(addCredits).toHaveBeenCalledTimes(2);

    // Both calls use the same payment-scoped idempotency key — that key is
    // what the Firestore guard keys on to enforce exactly-once semantics.
    const expectedArgs: [string, number, string, object] = [
      "user-1",
      1000,
      "purchase",
      expect.objectContaining({ idempotencyKey: "payment_pay-001" }),
    ];
    expect(addCredits).toHaveBeenNthCalledWith(1, ...expectedArgs);
    expect(addCredits).toHaveBeenNthCalledWith(2, ...expectedArgs);

    // First delivery: credits actually granted (skipped is falsy).
    const firstResult = await vi.mocked(addCredits).mock.results[0].value;
    expect(firstResult).toMatchObject({ newBalance: 1000, skipped: false });

    // Second delivery: idempotency guard fired — no second grant.
    const secondResult = await vi.mocked(addCredits).mock.results[1].value;
    expect(secondResult).toMatchObject({ skipped: true });
  });

  // ── Tamper: creditAmount in note doesn't match pack catalogue ────────────────

  it("returns 200 but does NOT call addCredits when creditAmount in note mismatches the pack catalogue", async () => {
    // The note claims 9999 credits but the catalogue says starter_pack = 1000.
    // The handler must reject the grant to prevent a forged note from inflating balances.
    const tamperedNote = "LITIGANT:userId=user-1,creditAmount=9999,pack=starter_pack";
    const body = JSON.stringify(
      makePaymentEvent({ note: tamperedNote, amount_money: { amount: 1000, currency: "USD" } }),
    );
    const sig = makeSignature(body);
    const app = buildApp();

    // Catalogue pack declares creditAmount=1000, not 9999.
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "1000" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(addCredits).not.toHaveBeenCalled();
  });

  // ── Tamper: paid amount doesn't match the pack's listed price ─────────────────

  it("returns 200 but does NOT call addCredits when paid amount mismatches the pack price", async () => {
    // The note is correct (1000 credits, starter_pack) but the payment shows
    // only 1¢ was actually charged — a forged checkout lowering the price.
    const body = JSON.stringify(
      makePaymentEvent({
        note:         "LITIGANT:userId=user-1,creditAmount=1000,pack=starter_pack",
        amount_money: { amount: 1, currency: "USD" }, // 1¢ instead of the expected 1000¢
      }),
    );
    const sig = makeSignature(body);
    const app = buildApp();

    // Catalogue declares the pack costs 1000¢; we paid 1¢.
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "1000" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(addCredits).not.toHaveBeenCalled();
  });

  // ── Tamper: unknown packId in note ────────────────────────────────────────────

  it("returns 200 but does NOT call addCredits when packId is not in the catalogue", async () => {
    // The note references a packId ("platinum_pack") that doesn't exist in the
    // catalogue — could be a forged note trying to bypass validation.
    const body = JSON.stringify(
      makePaymentEvent({
        note:         "LITIGANT:userId=user-1,creditAmount=1000,pack=platinum_pack",
        amount_money: { amount: 1000, currency: "USD" },
      }),
    );
    const sig = makeSignature(body);
    const app = buildApp();

    // Catalogue only has starter_pack — platinum_pack is unknown.
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "1000" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(addCredits).not.toHaveBeenCalled();
  });

  // ── Extra: missing signing key rejects even a legitimately signed request ──

  it("returns 401 when SQUARE_WEBHOOK_SIGNATURE_KEY is not configured", async () => {
    delete process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
    const body = JSON.stringify(makePaymentEvent());
    const sig  = makeSignature(body);
    const app  = buildApp();

    const res = await supertest(app)
      .post("/api/square/webhook")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", sig)
      .send(body);

    expect(res.status).toBe(401);
    expect(addCredits).not.toHaveBeenCalled();
  });
});
