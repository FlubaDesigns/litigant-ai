/**
 * Credit ledger unit tests.
 *
 * Covers four functions that form the financial spine of the app:
 *
 *   addCredits()       — idempotency key: first call grants, second is a no-op
 *   grantSignupBonus() — calling twice for the same UID grants the bonus once
 *   reserveCredits()   — rejects (HTTP 402) when balance < amount; succeeds otherwise
 *   reconcileCredits() — refunds the delta between estimated and actual cost
 *
 * addCredits / grantSignupBonus are imported and called directly with a mock
 * Firestore. reserveCredits / reconcileCredits are private to brain.ts and are
 * exercised through the POST /api/run-brain route via supertest.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks shared by every suite in this file
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../lib/firebaseAdmin.js", () => ({
  initFirebaseAdmin:    vi.fn(),
  isFirebaseConfigured: vi.fn(() => true),
  getFirestoreDb:       vi.fn(),
  verifyIdToken:        vi.fn(),
}));

vi.mock("../lib/billingDefaultsConfig.js", () => ({
  getBillingDefaults: vi.fn(() =>
    Promise.resolve({
      signupBonusCredits:           500,
      lowCreditThreshold:           100,
      lowCreditEmailThreshold:      50,
      emailCreditWarningThreshold:  50,
    })
  ),
}));

vi.mock("../lib/emailService.js", () => ({
  sendWelcomeEmail:              vi.fn(),
  sendVerificationEmail:         vi.fn(),
  sendPasswordResetEmail:        vi.fn(),
  sendAutoRefillTriggeredEmail:  vi.fn(),
  sendLowCreditsEmail:           vi.fn(),
  sendSessionCompleteEmail:      vi.fn(),
  sendFirstSessionEmail:         vi.fn(),
  sendZeroCreditsEmail:          vi.fn(),
  isResendConfigured:            vi.fn(() => false),
}));

vi.mock("../lib/brainEngine.js", () => ({
  runBrainSession: vi.fn(),
}));

vi.mock("../lib/creditEngine.js", () => ({
  estimateSessionCreditsCalibrated: vi.fn(() => Promise.resolve(200)),
  estimateFixedPipelineCost:        vi.fn(() => 50),
  calculateActualCredits:           vi.fn(() => 100),
  getModelRate:                     vi.fn(() => ({ input: 0.001, output: 0.002 })),
}));

vi.mock("../lib/pricingConfig.js", () => ({
  calculateLiveCredits: vi.fn(() => Promise.resolve(100)),
}));

vi.mock("../lib/squareClient.js", () => ({
  createPaymentLink:  vi.fn(),
  isSquareConfigured: vi.fn(() => false),
}));

vi.mock("../lib/rateLimiter.js", () => ({
  makeRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
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

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { addCredits, grantSignupBonus, checkAndTriggerAutoRefill } from "../lib/creditLedger.js";
import { getFirestoreDb, verifyIdToken } from "../lib/firebaseAdmin.js";
import { runBrainSession } from "../lib/brainEngine.js";
import { calculateLiveCredits } from "../lib/pricingConfig.js";
import { estimateSessionCreditsCalibrated } from "../lib/creditEngine.js";
import app from "../app.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Firestore builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal in-memory Firestore mock.
 *
 * Transactions are serialised behind a mutex (same technique as
 * concurrentProvision.test.ts) so the second concurrent transaction always
 * observes the first one's committed writes — mirroring Firestore's
 * serialisable isolation guarantee.
 */
function createMockDb(initialStore: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initialStore };
  // Auto-incrementing counter for anonymous doc IDs
  let autoId = 0;
  // Promise mutex — each runTransaction call chains on this so transactions
  // execute strictly one-at-a-time, matching Firestore's serial isolation.
  let txLock: Promise<void> = Promise.resolve();

  const makeDocRef = (collName: string, docId: string) => {
    const key = `${collName}/${docId}`;
    return {
      _key: key,
      id: docId,
      _get() {
        return { exists: key in store, data: () => store[key] ?? null, id: docId };
      },
      async get()             { return this._get(); },
      async set(data: any, opts?: any) {
        if (opts?.merge) {
          store[key] = { ...(store[key] ?? {}), ...data };
        } else {
          store[key] = data;
        }
      },
      async update(data: any) { store[key] = { ...(store[key] ?? {}), ...data }; },
      collection: (sub: string) => makeCollection(`${collName}/${docId}/${sub}`),
    };
  };

  const makeCollection = (name: string) => ({
    doc: (id?: string) => makeDocRef(name, id ?? `auto_${++autoId}`),
    async add(data: any) {
      const id = `auto_${++autoId}`;
      store[`${name}/${id}`] = data;
      return { id };
    },
    where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
  });

  return {
    _store: store,
    collection: (name: string) => makeCollection(name),
    runTransaction: <T>(fn: (txn: any) => Promise<T>): Promise<T> => {
      const run = txLock.then(async (): Promise<T> => {
        // Buffer writes — commit only after fn resolves (atomic semantics)
        const pending: Array<{ key: string; data: any; op: "set" | "update"; mergeOpt?: boolean }> = [];

        const txn = {
          get: async (ref: any) => ref._get(),
          set: (ref: any, data: any, opts?: any) =>
            pending.push({ key: ref._key, data, op: "set", mergeOpt: opts?.merge }),
          update: (ref: any, data: any) =>
            pending.push({ key: ref._key, data, op: "update" }),
        };

        const result = await fn(txn);

        for (const { key, data, op, mergeOpt } of pending) {
          if (op === "set") {
            store[key] = mergeOpt ? { ...(store[key] ?? {}), ...data } : data;
          } else {
            store[key] = { ...(store[key] ?? {}), ...data };
          }
        }

        return result;
      });

      // Advance the lock to the current run — next transaction waits for this one.
      txLock = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — addCredits (direct unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe("addCredits()", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
  });

  it("grants credits and writes a ledger entry on the first call", async () => {
    const result = await addCredits("user-1", 500, "signup_bonus", {
      source: "test_grant",
    });

    expect(result).not.toBeNull();
    expect(result!.skipped).toBeUndefined();
    expect(result!.newBalance).toBe(500);

    // User document should reflect the new balance
    const userDoc = mockDb._store["users/user-1"];
    expect(userDoc).toBeDefined();
    expect(userDoc.creditBalance).toBe(500);

    // One ledger entry should have been written
    const ledgerKeys = Object.keys(mockDb._store).filter(k =>
      k.startsWith("credit_transactions/")
    );
    expect(ledgerKeys).toHaveLength(1);
    const ledger = mockDb._store[ledgerKeys[0]];
    expect(ledger.type).toBe("signup_bonus");
    expect(ledger.amount).toBe(500);
    expect(ledger.balanceAfter).toBe(500);
  });

  it("accumulates credits on subsequent calls without an idempotency key", async () => {
    await addCredits("user-2", 300, "purchase");
    const result = await addCredits("user-2", 200, "purchase");

    expect(result!.newBalance).toBe(500);
    expect(mockDb._store["users/user-2"].creditBalance).toBe(500);
  });

  it("first call with idempotency key grants credits and writes the dedup doc", async () => {
    const result = await addCredits("user-3", 100, "purchase", {
      idempotencyKey: "evt_abc123",
    });

    expect(result!.skipped).toBeUndefined();
    expect(result!.newBalance).toBe(100);

    // Dedup doc should now exist
    const dedupDoc = mockDb._store["payment_events/evt_abc123"];
    expect(dedupDoc).toBeDefined();
    expect(dedupDoc.uid).toBe("user-3");
  });

  it("second call with the same idempotency key is a no-op (skipped)", async () => {
    await addCredits("user-4", 100, "purchase", { idempotencyKey: "evt_dedup" });
    const result = await addCredits("user-4", 100, "purchase", { idempotencyKey: "evt_dedup" });

    expect(result!.skipped).toBe(true);
    // Balance must not have changed on the second call
    expect(mockDb._store["users/user-4"].creditBalance).toBe(100);
  });

  it("no-op on second call does not write additional ledger entries", async () => {
    await addCredits("user-5", 200, "purchase", { idempotencyKey: "evt_once" });
    await addCredits("user-5", 200, "purchase", { idempotencyKey: "evt_once" });

    const ledgerKeys = Object.keys(mockDb._store).filter(k =>
      k.startsWith("credit_transactions/")
    );
    // Only one ledger entry should exist (from the first call)
    expect(ledgerKeys).toHaveLength(1);
  });

  it("records a negative amount for a deduction", async () => {
    // Start with an existing balance
    mockDb._store["users/user-6"] = { creditBalance: 500 };

    const result = await addCredits("user-6", -150, "usage", { source: "test_deduct" });

    expect(result!.newBalance).toBe(350);
    expect(mockDb._store["users/user-6"].creditBalance).toBe(350);

    const ledgerKeys = Object.keys(mockDb._store).filter(k =>
      k.startsWith("credit_transactions/")
    );
    expect(ledgerKeys).toHaveLength(1);
    expect(mockDb._store[ledgerKeys[0]].amount).toBe(-150);
  });

  it("returns null when Firebase is not configured", async () => {
    const { isFirebaseConfigured } = await import("../lib/firebaseAdmin.js");
    vi.mocked(isFirebaseConfigured).mockReturnValueOnce(false);

    const result = await addCredits("user-7", 100, "purchase");
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — grantSignupBonus (direct unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe("grantSignupBonus()", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
  });

  it("grants 500 credits on the first call and records a ledger entry", async () => {
    const result = await grantSignupBonus("new-user-1");

    expect(result.skipped).toBe(false);
    expect(result.amount).toBe(500);
    expect(mockDb._store["users/new-user-1"].creditBalance).toBe(500);

    // Idempotency key doc should exist
    expect(mockDb._store["payment_events/signup_bonus_new-user-1"]).toBeDefined();
  });

  it("second call for the same UID is skipped (bonus granted only once)", async () => {
    await grantSignupBonus("new-user-2");
    const second = await grantSignupBonus("new-user-2");

    expect(second.skipped).toBe(true);
    // Balance must remain at 500, not 1000
    expect(mockDb._store["users/new-user-2"].creditBalance).toBe(500);
  });

  it("is idempotent even under concurrent calls", async () => {
    // Fire both calls simultaneously
    const [r1, r2] = await Promise.all([
      grantSignupBonus("new-user-3"),
      grantSignupBonus("new-user-3"),
    ]);

    const grantedCount = [r1, r2].filter(r => !r.skipped).length;
    const skippedCount = [r1, r2].filter(r => r.skipped).length;

    expect(grantedCount).toBe(1);
    expect(skippedCount).toBe(1);
    // Exactly one ledger entry — no double-grant
    const ledgerKeys = Object.keys(mockDb._store).filter(k =>
      k.startsWith("credit_transactions/")
    );
    expect(ledgerKeys).toHaveLength(1);
    // Final balance is exactly one bonus, not two
    expect(mockDb._store["users/new-user-3"].creditBalance).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route-level helpers shared by Suites 3 & 4
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_UID   = "uid-credit-test";
const FAKE_TOKEN = "valid-token-credit-test";

/** Minimal brain body — question required; config optional extras. */
const BRAIN_BODY = {
  question: "Is contributory negligence a complete bar in England?",
  config: {
    model:            "gpt-4o",
    litigantCount:    2,
    confidenceTarget: 80,
    responseMode:     "balanced",
    outputFormat:     "report",
  },
};

/**
 * Creates an SSE-aware runBrainSession mock that ends the response immediately
 * and returns synthetic token counts.
 */
function makeBrainMock({
  inputTokens  = 500,
  outputTokens = 500,
  creditsUsed  = 100,
} = {}) {
  return vi.fn().mockImplementation(async ({ res, sessionId }: any) => {
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    return {
      sessionId:       sessionId ?? "test-session-id",
      creditsUsed,
      model:           "gpt-4o",
      confidence:      85,
      finalAnswer:     "Test answer",
      debateNotes:     null,
      transcript:      [],
      caveats:         [],
      artifacts:       [],
      turns:           [],
      fixedStageTokens: 0,
      conscienceVersion: 1,
      tokenUsage: { inputTokens, outputTokens },
    } as any;
  });
}

/**
 * Builds a mock db with a single user doc at `users/{uid}` pre-seeded with
 * the given creditBalance. Also wires the sessions and credit_transactions
 * collections so route writes don't throw.
 */
function createRouteMockDb(uid: string, creditBalance: number) {
  const initial: Record<string, any> = {};
  initial[`users/${uid}`] = { creditBalance, email: "test@example.com" };
  const db = createMockDb(initial);

  // Expose a .add() on every sub-collection the route touches
  const origCollection = db.collection.bind(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — reserveCredits (via POST /api/run-brain)
// ─────────────────────────────────────────────────────────────────────────────

describe("reserveCredits() — via POST /api/run-brain", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    // estimatedCost is mocked to 200 globally
    vi.mocked(estimateSessionCreditsCalibrated).mockResolvedValue(200);
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: FAKE_UID, admin: false } as any);
    vi.mocked(runBrainSession).mockImplementation(makeBrainMock());
  });

  it("returns HTTP 402 when balance is less than the estimated cost", async () => {
    // Balance = 50, estimated cost = 200 → insufficient
    mockDb = createRouteMockDb(FAKE_UID, 50);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/insufficient credits/i);
    // Balance must be untouched — no deduction on rejection
    expect(mockDb._store[`users/${FAKE_UID}`].creditBalance).toBe(50);
  });

  it("returns HTTP 402 when balance is exactly zero", async () => {
    mockDb = createRouteMockDb(FAKE_UID, 0);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    expect(res.status).toBe(402);
    expect(mockDb._store[`users/${FAKE_UID}`].creditBalance).toBe(0);
  });

  it("deducts the estimated cost when balance equals the required amount", async () => {
    // Balance = 200, estimated cost = 200 → exact match, should succeed
    mockDb = createRouteMockDb(FAKE_UID, 200);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    // Actual cost = estimated cost → no refund delta
    vi.mocked(calculateLiveCredits).mockResolvedValue(200);

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    // Session proceeds — SSE stream returns 200
    expect(res.status).toBe(200);

    // A usage ledger entry must exist for the reservation
    const ledgerKeys = Object.keys(mockDb._store).filter(k =>
      k.startsWith("credit_transactions/")
    );
    const usageEntry = ledgerKeys
      .map(k => mockDb._store[k])
      .find(d => d.type === "usage" && d.source === "brain_reservation");
    expect(usageEntry).toBeDefined();
    expect(usageEntry.amount).toBe(-200);
  });

  it("deducts the estimated cost when balance exceeds the required amount", async () => {
    // Balance = 1000, estimated cost = 200 → ample balance
    mockDb = createRouteMockDb(FAKE_UID, 1000);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(calculateLiveCredits).mockResolvedValue(200);

    await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    // After session: reservation −200, actual == estimated → no refund → net 800
    const finalBalance = mockDb._store[`users/${FAKE_UID}`].creditBalance;
    expect(finalBalance).toBe(800);
  });

  it("does not run the brain engine when balance is insufficient", async () => {
    mockDb = createRouteMockDb(FAKE_UID, 10);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    expect(runBrainSession).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — reconcileCredits (via POST /api/run-brain)
// ─────────────────────────────────────────────────────────────────────────────

describe("reconcileCredits() — via POST /api/run-brain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(estimateSessionCreditsCalibrated).mockResolvedValue(200);
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: FAKE_UID, admin: false } as any);
  });

  it("refunds the delta when actual cost is less than estimated", async () => {
    // estimated = 200, actual = 100 → refund = 100
    const mockDb = createRouteMockDb(FAKE_UID, 500);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(calculateLiveCredits).mockResolvedValue(100);
    vi.mocked(runBrainSession).mockImplementation(makeBrainMock({ creditsUsed: 100 }));

    await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    // Start 500 − reserve 200 + refund 100 = 400
    expect(mockDb._store[`users/${FAKE_UID}`].creditBalance).toBe(400);

    // A "refund" ledger entry for the reconcile must exist
    const ledgerDocs = Object.keys(mockDb._store)
      .filter(k => k.startsWith("credit_transactions/"))
      .map(k => mockDb._store[k]);
    const refundEntry = ledgerDocs.find(d => d.source === "brain_reconcile");
    expect(refundEntry).toBeDefined();
    expect(refundEntry.type).toBe("refund");
    expect(refundEntry.amount).toBe(100);
  });

  it("writes no refund ledger entry when actual cost equals estimated", async () => {
    // estimated = actual = 200 → refund = 0, no reconcile write
    const mockDb = createRouteMockDb(FAKE_UID, 500);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(calculateLiveCredits).mockResolvedValue(200);
    vi.mocked(runBrainSession).mockImplementation(makeBrainMock({ creditsUsed: 200 }));

    await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    const ledgerDocs = Object.keys(mockDb._store)
      .filter(k => k.startsWith("credit_transactions/"))
      .map(k => mockDb._store[k]);
    const refundEntry = ledgerDocs.find(d => d.source === "brain_reconcile");
    // No refund — delta is zero
    expect(refundEntry).toBeUndefined();
    // Net balance: 500 − 200 = 300
    expect(mockDb._store[`users/${FAKE_UID}`].creditBalance).toBe(300);
  });

  it("issues a full refund (brain_failure_refund) when the session throws", async () => {
    // estimated = 200; session crashes → full 200 refund
    const mockDb = createRouteMockDb(FAKE_UID, 500);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(runBrainSession).mockImplementation(async ({ res }: any) => {
      // Write an error event so the route's error handler fires
      res.write(`data: ${JSON.stringify({ type: "error", message: "provider down" })}\n\n`);
      res.end();
      throw new Error("provider down");
    });

    await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    // Start 500 − reserve 200 + failure refund 200 = 500 (net zero cost)
    expect(mockDb._store[`users/${FAKE_UID}`].creditBalance).toBe(500);

    const ledgerDocs = Object.keys(mockDb._store)
      .filter(k => k.startsWith("credit_transactions/"))
      .map(k => mockDb._store[k]);
    const failureRefund = ledgerDocs.find(d => d.source === "brain_failure_refund");
    expect(failureRefund).toBeDefined();
    expect(failureRefund.type).toBe("refund");
    expect(failureRefund.amount).toBe(200);
  });

  it("charges an overage ledger entry when actual cost exceeds estimated", async () => {
    // estimated = 200, actual = 300 → overage = 100
    const mockDb = createRouteMockDb(FAKE_UID, 600);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(calculateLiveCredits).mockResolvedValue(300);
    vi.mocked(runBrainSession).mockImplementation(makeBrainMock({ creditsUsed: 300 }));

    await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    // Start 600 − reserve 200 − overage 100 = 300
    expect(mockDb._store[`users/${FAKE_UID}`].creditBalance).toBe(300);

    const ledgerDocs = Object.keys(mockDb._store)
      .filter(k => k.startsWith("credit_transactions/"))
      .map(k => mockDb._store[k]);
    const overageEntry = ledgerDocs.find(d => d.source === "brain_overage");
    expect(overageEntry).toBeDefined();
    expect(overageEntry.type).toBe("usage");
    expect(overageEntry.amount).toBe(-100);
  });

  it("writes a usage_shortfall entry and does not drive balance negative when overage cannot be collected", async () => {
    // estimated = 200, user balance = 200 (exactly covers reservation)
    // actual = 350 → overage = 150, but post-reservation balance = 0 → uncollectable
    const mockDb = createRouteMockDb(FAKE_UID, 200);
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(calculateLiveCredits).mockResolvedValue(350);
    vi.mocked(runBrainSession).mockImplementation(makeBrainMock({ creditsUsed: 350 }));

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send(BRAIN_BODY);

    // The session itself must complete (not 402) — the result was already delivered
    expect(res.status).toBe(200);

    // Balance after reservation was 0; the uncollectable overage must NOT push it below 0
    const finalBalance = mockDb._store[`users/${FAKE_UID}`].creditBalance;
    expect(finalBalance).toBeGreaterThanOrEqual(0);

    // A usage_shortfall ledger entry must be present in credit_transactions
    const ledgerDocs = Object.values(mockDb._store).filter(
      (v: any) => v && v.type === "usage_shortfall"
    );
    expect(ledgerDocs).toHaveLength(1);

    const shortfall = ledgerDocs[0] as any;
    // The shortfall entry records the uncollected overage amount for audit purposes
    expect(shortfall.overage).toBe(150);
    // source identifies this as an uncollected overage (not a normal reservation)
    expect(shortfall.source).toBe("brain_overage_uncollected");
    // amount must be 0 — no balance was deducted on this path
    expect(shortfall.amount).toBe(0);
    // userId ties the entry back to the user
    expect(shortfall.userId).toBe(FAKE_UID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — checkAndTriggerAutoRefill (direct unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe("checkAndTriggerAutoRefill()", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  const UID = "uid-autorefill-test";

  /** Minimal auto-refill preference that is enabled and configured. */
  const ENABLED_PREFS = {
    enabled: true,
    thresholdCredits: 200,
    dollarAmount: 10,
  };

  /** createCheckoutUrl stub that always returns a deterministic URL. */
  const stubCheckout = vi.fn(async (_dollarAmount: number, _uid: string) =>
    "https://square.link/checkout/test-url"
  );

  beforeEach(() => {
    vi.clearAllMocks();
    stubCheckout.mockResolvedValue("https://square.link/checkout/test-url");
  });

  it("writes autoRefillCheckoutUrl when balance drops below threshold", async () => {
    // User has auto-refill enabled; balance (50) < threshold (200) → should trigger.
    mockDb = createMockDb({
      [`users/${UID}`]: { creditBalance: 50, autoRefill: ENABLED_PREFS },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 50, stubCheckout);

    // createCheckoutUrl must have been called with the configured dollar amount and uid.
    expect(stubCheckout).toHaveBeenCalledWith(ENABLED_PREFS.dollarAmount, UID);

    // The user document must now carry the checkout URL.
    const userDoc = mockDb._store[`users/${UID}`];
    expect(userDoc.autoRefillCheckoutUrl).toBe("https://square.link/checkout/test-url");
    expect(userDoc.autoRefillTriggeredAt).toBeDefined();
  });

  it("is a no-op when balance stays at or above the threshold", async () => {
    // balance (200) === threshold (200) → should NOT trigger.
    mockDb = createMockDb({
      [`users/${UID}`]: { creditBalance: 200, autoRefill: ENABLED_PREFS },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 200, stubCheckout);

    expect(stubCheckout).not.toHaveBeenCalled();
    const userDoc = mockDb._store[`users/${UID}`];
    expect(userDoc.autoRefillCheckoutUrl).toBeUndefined();
  });

  it("is a no-op when balance is well above the threshold", async () => {
    // balance (500) > threshold (200) → should NOT trigger.
    mockDb = createMockDb({
      [`users/${UID}`]: { creditBalance: 500, autoRefill: ENABLED_PREFS },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 500, stubCheckout);

    expect(stubCheckout).not.toHaveBeenCalled();
  });

  it("is a no-op when auto-refill is disabled", async () => {
    // Pref exists but enabled=false → should NOT trigger regardless of balance.
    mockDb = createMockDb({
      [`users/${UID}`]: {
        creditBalance: 10,
        autoRefill: { ...ENABLED_PREFS, enabled: false },
      },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 10, stubCheckout);

    expect(stubCheckout).not.toHaveBeenCalled();
    const userDoc = mockDb._store[`users/${UID}`];
    expect(userDoc.autoRefillCheckoutUrl).toBeUndefined();
  });

  it("is a no-op when the user has no auto-refill preference set", async () => {
    // No autoRefill field on the user doc at all.
    mockDb = createMockDb({
      [`users/${UID}`]: { creditBalance: 10 },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 10, stubCheckout);

    expect(stubCheckout).not.toHaveBeenCalled();
  });

  it("is a no-op when the user document does not exist", async () => {
    // Empty store — no user document at all.
    mockDb = createMockDb({});
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 10, stubCheckout);

    expect(stubCheckout).not.toHaveBeenCalled();
  });

  it("does not write the checkout URL when createCheckoutUrl returns null", async () => {
    // balance below threshold but checkout creation fails.
    mockDb = createMockDb({
      [`users/${UID}`]: { creditBalance: 50, autoRefill: ENABLED_PREFS },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    stubCheckout.mockResolvedValueOnce(null as any);

    await checkAndTriggerAutoRefill(UID, 50, stubCheckout);

    expect(stubCheckout).toHaveBeenCalled();
    const userDoc = mockDb._store[`users/${UID}`];
    expect(userDoc.autoRefillCheckoutUrl).toBeUndefined();
  });

  it("is a no-op when Firebase is not configured", async () => {
    const { isFirebaseConfigured } = await import("../lib/firebaseAdmin.js");
    vi.mocked(isFirebaseConfigured).mockReturnValueOnce(false);

    // Should return early without touching mockDb or calling stubCheckout.
    mockDb = createMockDb({
      [`users/${UID}`]: { creditBalance: 10, autoRefill: ENABLED_PREFS },
    });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    await checkAndTriggerAutoRefill(UID, 10, stubCheckout);

    expect(stubCheckout).not.toHaveBeenCalled();
  });
});
