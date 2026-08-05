/**
 * Unit tests for Square webhook processing.
 *
 * Covers:
 *  - verifySquareWebhook: HMAC-SHA256 signature verification (pure function)
 *  - handleSquareEvent:
 *      • valid payment → credits granted
 *      • duplicate event (idempotency key already seen) → skipped, no double-grant
 *      • forged note (no LITIGANT metadata) → ignored
 *      • creditAmount mismatch with pack catalogue → rejected
 *      • unknown packId → rejected
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  isResendConfigured:     vi.fn(() => false),
  sendPaymentReceiptEmail: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { verifySquareWebhook, handleSquareEvent } from "../lib/squareEventHandler.js";
import { addCredits }      from "../lib/creditLedger.js";
import { getAllCreditPacks } from "../lib/creditPacksConfig.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIGNING_KEY     = "test-signing-key-abc123";
const NOTIFICATION_URL = "https://example.com/webhook";

/** Build the Base64-encoded HMAC-SHA256 Square signature for rawBody. */
function makeSignature(rawBody: string, key = SIGNING_KEY): string {
  return crypto
    .createHmac("sha256", key)
    .update(NOTIFICATION_URL + rawBody)
    .digest("base64");
}

/** Build a minimal valid payment.updated event. */
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

// ── verifySquareWebhook ───────────────────────────────────────────────────────

describe("verifySquareWebhook", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SQUARE_WEBHOOK_SIGNATURE_KEY: SIGNING_KEY };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("accepts a valid HMAC-SHA256 signature", () => {
    const body = JSON.stringify({ test: true });
    const sig  = makeSignature(body);
    expect(verifySquareWebhook(body, sig, NOTIFICATION_URL)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body      = JSON.stringify({ test: true });
    const sig       = makeSignature(body);
    const tamperedBody = JSON.stringify({ test: false });
    expect(verifySquareWebhook(tamperedBody, sig, NOTIFICATION_URL)).toBe(false);
  });

  it("rejects a forged signature", () => {
    const body = JSON.stringify({ test: true });
    expect(verifySquareWebhook(body, "forged-sig", NOTIFICATION_URL)).toBe(false);
  });

  it("rejects when SQUARE_WEBHOOK_SIGNATURE_KEY is not set", () => {
    delete process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
    const body = JSON.stringify({ test: true });
    const sig  = makeSignature(body);
    expect(verifySquareWebhook(body, sig, NOTIFICATION_URL)).toBe(false);
  });

  it("rejects a valid body signed with a different key", () => {
    const body = JSON.stringify({ test: true });
    const sig  = makeSignature(body, "different-key");
    expect(verifySquareWebhook(body, sig, NOTIFICATION_URL)).toBe(false);
  });
});

// ── handleSquareEvent ─────────────────────────────────────────────────────────

describe("handleSquareEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: pack catalogue returns a matching pack
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "1000" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    // Default: addCredits succeeds with a fresh grant
    vi.mocked(addCredits).mockResolvedValue({ newBalance: 1000, skipped: false });
  });

  it("grants credits on a valid COMPLETED payment", async () => {
    await handleSquareEvent(makePaymentEvent() as any);

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

  it("skips a duplicate event (idempotency key already processed)", async () => {
    vi.mocked(addCredits).mockResolvedValue({ newBalance: 1000, skipped: true });

    await handleSquareEvent(makePaymentEvent() as any);

    // addCredits is still called — deduplication happens inside it.
    // The grant is a no-op; no email should fire.
    expect(addCredits).toHaveBeenCalledOnce();
  });

  it("ignores a payment whose note has no LITIGANT metadata", async () => {
    const event = makePaymentEvent({ note: "No metadata here" });
    await handleSquareEvent(event as any);

    expect(addCredits).not.toHaveBeenCalled();
  });

  it("rejects when creditAmount in the note mismatches the pack catalogue", async () => {
    // Pack declares 500 credits; note claims 1000 — potential forgery
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "500" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    await handleSquareEvent(makePaymentEvent() as any); // note says 1000, pack says 500

    expect(addCredits).not.toHaveBeenCalled();
  });

  it("rejects when the paid amount mismatches the pack price (>5 cent tolerance)", async () => {
    // Pack price is $10.00 (1000 cents); event claims $5.00 (500 cents) was paid
    vi.mocked(getAllCreditPacks).mockResolvedValue({
      starter_pack: {
        id:       "starter_pack",
        name:     "Starter",
        active:   true,
        metadata: { creditAmount: "1000" },
        prices:   [{ unit_amount: 1000, currency: "USD", id: "price-1" }],
      } as any,
    });

    const event = makePaymentEvent({ amount_money: { amount: 500, currency: "USD" } });
    await handleSquareEvent(event as any);

    expect(addCredits).not.toHaveBeenCalled();
  });

  it("rejects an unknown packId that is not in the catalogue", async () => {
    // Pack catalogue does not contain "unknown_pack"
    vi.mocked(getAllCreditPacks).mockResolvedValue({});

    const event = makePaymentEvent({
      note: "LITIGANT:userId=user-1,creditAmount=1000,pack=unknown_pack",
    });
    await handleSquareEvent(event as any);

    expect(addCredits).not.toHaveBeenCalled();
  });

  it("ignores non-COMPLETED payment status", async () => {
    const event = makePaymentEvent({ status: "PENDING" });
    await handleSquareEvent(event as any);

    expect(addCredits).not.toHaveBeenCalled();
  });

  it("silently ignores unhandled event types", async () => {
    await handleSquareEvent({ ...makePaymentEvent(), type: "refund.created" } as any);

    expect(addCredits).not.toHaveBeenCalled();
  });
});
