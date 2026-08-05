/**
 * Guest reservation tests.
 *
 * Two simultaneous guest requests from the same IP must result in exactly one
 * successful session and one HTTP 402 ("guest limit reached") response.
 *
 * claimGuestSession() uses Firestore .create() as an atomic lock; the mock
 * replicates that semantics — the first call succeeds, every subsequent call
 * for the same key throws ALREADY_EXISTS (gRPC code 6).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/firebaseAdmin.js", () => ({
  initFirebaseAdmin:    vi.fn(),
  isFirebaseConfigured: vi.fn(() => true),
  getFirestoreDb:       vi.fn(),
  verifyIdToken:        vi.fn(),
}));

vi.mock("../lib/brainEngine.js", () => ({
  runBrainSession: vi.fn(),
}));

vi.mock("../lib/creditEngine.js", () => ({
  estimateSessionCreditsCalibrated: vi.fn(() => Promise.resolve(100)),
  estimateFixedPipelineCost:        vi.fn(() => 50),
  calculateActualCredits:           vi.fn(() => 100),
  getModelRate:                     vi.fn(() => ({ inputRate: 1, outputRate: 2 })),
}));

vi.mock("../lib/pricingConfig.js", () => ({
  calculateLiveCredits: vi.fn(() => Promise.resolve(100)),
}));

vi.mock("../lib/creditLedger.js", () => ({
  checkAndTriggerAutoRefill: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/emailService.js", () => ({
  sendLowCreditsEmail:      vi.fn(),
  sendSessionCompleteEmail: vi.fn(),
  sendFirstSessionEmail:    vi.fn(),
  sendZeroCreditsEmail:     vi.fn(),
  isResendConfigured:       vi.fn(() => false),
}));

vi.mock("../lib/squareClient.js", () => ({
  createPaymentLink:  vi.fn(),
  isSquareConfigured: vi.fn(() => false),
}));

vi.mock("../lib/rateLimiter.js", () => ({
  makeRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock("../lib/billingDefaultsConfig.js", () => ({
  getBillingDefaults: vi.fn(() => Promise.resolve({
    signupBonusCredits:      500,
    lowCreditThreshold:      100,
    lowCreditEmailThreshold: 50,
  })),
}));

vi.mock("../lib/safeError.js", () => ({
  safeError: vi.fn((err: any) => ({ message: err?.message ?? "error" })),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import app from "../app.js";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";
import { runBrainSession } from "../lib/brainEngine.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a mock Firestore whose guest_sessions collection enforces atomic
 * "first writer wins" semantics via a Set, mirroring Firestore's .create() /
 * ALREADY_EXISTS contract.
 *
 * The check-then-add in .create() is synchronous (no await between the two
 * operations), so concurrent Node.js tasks cannot interleave between them —
 * exactly one call wins, all others receive an ALREADY_EXISTS error.
 */
function createGuestMockDb() {
  const createdKeys = new Set<string>();
  const store: Record<string, any>      = {};

  const makeDocRef = (collName: string, docId: string) => {
    const key = `${collName}/${docId}`;
    return {
      _key: key,
      _get() {
        return { exists: key in store, data: () => store[key] ?? null, id: docId };
      },
      async get()             { return this._get(); },
      async set(data: any)    { store[key] = data; },
      async update(data: any) { store[key] = { ...store[key], ...data }; },
      // Atomic create: succeeds only once per key; throws ALREADY_EXISTS (code 6) otherwise.
      create(data: any): Promise<void> {
        if (createdKeys.has(key)) {
          return Promise.reject(
            Object.assign(new Error("ALREADY_EXISTS"), { code: 6 }),
          );
        }
        // Synchronous mark-then-store — no yield point between check and write.
        createdKeys.add(key);
        store[key] = data;
        return Promise.resolve();
      },
    };
  };

  return {
    _store:       store,
    _createdKeys: createdKeys,
    collection: (name: string) => ({
      doc:  (id?: string) => makeDocRef(name, id ?? `auto_${Math.random()}`),
      add:  async (data: any) => {
        const id = `auto_${Date.now()}`;
        store[`${name}/${id}`] = data;
        return { id };
      },
    }),
    runTransaction: async (fn: (txn: any) => Promise<any>) => {
      const txn = {
        get:    async (ref: any)             => ref._get(),
        set:    (ref: any, data: any)         => { store[ref._key] = data; },
        update: (ref: any, data: any)         => { store[ref._key] = { ...store[ref._key], ...data }; },
      };
      return fn(txn);
    },
  };
}

/** Minimal SSE-aware runBrainSession mock that ends the response immediately. */
function makeBrainMock() {
  return vi.fn().mockImplementation(async ({ res, sessionId }: any) => {
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    return {
      sessionId:   sessionId ?? "guest-session",
      creditsUsed: 0,
      model:       "gpt-4",
      tokenUsage:  { inputTokens: 10, outputTokens: 10 },
    } as any;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const GUEST_BODY = {
  question: "What is the legal standard for negligence?",
  config:   {
    model:            "gpt-4",
    litigantCount:    3,
    confidenceTarget: 80,
    responseMode:     "balanced",
    outputFormat:     "report",
  },
};

describe("Guest session reservation", () => {
  let mockDb: ReturnType<typeof createGuestMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createGuestMockDb();
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(runBrainSession).mockImplementation(makeBrainMock());
  });

  it("allows exactly one guest session per IP — the second request gets 402", async () => {
    // Both requests share the same server IP (127.0.0.1 in supertest).
    const [res1, res2] = await Promise.all([
      request(app).post("/api/run-brain").send(GUEST_BODY),
      request(app).post("/api/run-brain").send(GUEST_BODY),
    ]);

    // One request must succeed (SSE stream) and one must be rejected with 402.
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toContain(402);

    // The 402 response must carry the guestLimitReached flag.
    const limited = [res1, res2].find(r => r.status === 402);
    expect(limited!.body).toMatchObject({ guestLimitReached: true });

    // Exactly one guest_sessions document must have been created.
    const guestKeys = Object.keys(mockDb._store).filter(k =>
      k.startsWith("guest_sessions/"),
    );
    expect(guestKeys).toHaveLength(1);
  });

  it("rejects the second guest request even in sequential calls", async () => {
    // First request: should pass the claim gate
    const res1 = await request(app).post("/api/run-brain").send(GUEST_BODY);
    // Second request from same IP: should be blocked
    const res2 = await request(app).post("/api/run-brain").send(GUEST_BODY);

    expect(res2.status).toBe(402);
    expect(res2.body).toMatchObject({ guestLimitReached: true });

    // Brain engine must only have been invoked for the first request
    const successCount = [res1, res2].filter(r => r.status !== 402).length;
    expect(successCount).toBe(1);
  });

  it("does not restrict authenticated users", async () => {
    // An authenticated user (Bearer token) follows a completely different path
    // and must never be blocked by the guest IP gate.
    // (This test verifies the gate is guest-only, not a global per-IP block.)
    //
    // We do not mock verifyIdToken here — it stays as vi.fn() returning undefined,
    // which makes the route return 401 for an expired/invalid token. That 401
    // confirms auth is being checked for bearer requests, not the guest gate.
    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", "Bearer some-token")
      .send(GUEST_BODY);

    // 401 (bad token) is expected — NOT 402 (guest limit)
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("guestLimitReached");
  });
});
