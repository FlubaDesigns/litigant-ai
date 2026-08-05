/**
 * Session ownership tests.
 *
 * Verifies that a user cannot resume (or overwrite) a session they do not own.
 * User B supplying user A's sessionId in a resume request must receive HTTP 403
 * before any credits are reserved or AI calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/firebaseAdmin.js", () => ({
  initFirebaseAdmin: vi.fn(),
  isFirebaseConfigured: vi.fn(() => true),
  getFirestoreDb: vi.fn(),
  verifyIdToken: vi.fn(),
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
  sendLowCreditsEmail:     vi.fn(),
  sendSessionCompleteEmail: vi.fn(),
  sendFirstSessionEmail:   vi.fn(),
  sendZeroCreditsEmail:    vi.fn(),
  isResendConfigured:      vi.fn(() => false),
}));

vi.mock("../lib/squareClient.js", () => ({
  createPaymentLink: vi.fn(),
  isSquareConfigured: vi.fn(() => false),
}));

vi.mock("../lib/rateLimiter.js", () => ({
  makeRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock("../lib/billingDefaultsConfig.js", () => ({
  getBillingDefaults: vi.fn(() => Promise.resolve({
    signupBonusCredits:       500,
    lowCreditThreshold:       100,
    lowCreditEmailThreshold:  50,
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
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { runBrainSession } from "../lib/brainEngine.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal in-memory Firestore that handles the collections the brain route uses. */
function createMockDb(sessions: Record<string, { userId: string }> = {}) {
  const store: Record<string, any> = {};

  // Pre-populate session documents
  for (const [id, data] of Object.entries(sessions)) {
    store[`sessions/${id}`] = data;
  }

  const makeDocRef = (collName: string, docId: string) => {
    const key = `${collName}/${docId}`;
    return {
      _key: key,
      _get() {
        return { exists: key in store, data: () => store[key] ?? null, id: docId };
      },
      async get()           { return this._get(); },
      async set(data: any)  { store[key] = data; },
      async update(data: any) { store[key] = { ...store[key], ...data }; },
      async create(data: any) { store[key] = data; },
      // Support sub-collections (e.g. sessionRef.collection("session_turns"))
      collection: (_sub: string) => ({
        add: async (data: any) => {
          const subId = `${key}_sub_${Date.now()}`;
          store[subId] = data;
          return { id: subId };
        },
        doc: (_id?: string) => ({
          set: async () => {},
          update: async () => {},
          get: async () => ({ exists: false, data: () => null }),
        }),
      }),
    };
  };

  return {
    collection: (name: string) => ({
      doc: (id?: string) => makeDocRef(name, id ?? `auto_${Math.random()}`),
      add: async (data: any) => {
        const id = `auto_${Date.now()}`;
        store[`${name}/${id}`] = data;
        return { id };
      },
    }),
    runTransaction: async (fn: (txn: any) => Promise<any>) => {
      const txn = {
        get:    async (ref: any) => ref._get(),
        set:    (ref: any, data: any) => { store[ref._key] = data; },
        update: (ref: any, data: any) => { store[ref._key] = { ...store[ref._key], ...data }; },
      };
      return fn(txn);
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Session ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runBrainSession).mockResolvedValue({} as any);
  });

  it("returns 403 when user B tries to resume user A's session", async () => {
    const mockDb = createMockDb({ "session-owned-by-A": { userId: "user-A" } });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid:           "user-B",
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", "Bearer fake-token-for-B")
      .send({
        question:              "Is this session mine?",
        config:                { model: "gpt-4", litigantCount: 3, confidenceTarget: 80, responseMode: "balanced", outputFormat: "report" },
        sessionId:             "session-owned-by-A",
        continueFromTranscript: ["prior turn"],
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ message: expect.stringContaining("access denied") });
    // No AI call should have been made
    expect(runBrainSession).not.toHaveBeenCalled();
  });

  it("returns 403 when user B tries to resume a session that does not exist", async () => {
    const mockDb = createMockDb({}); // no sessions in store
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid:           "user-B",
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", "Bearer fake-token-for-B")
      .send({
        question:              "Where is my session?",
        config:                { model: "gpt-4", litigantCount: 3, confidenceTarget: 80, responseMode: "balanced", outputFormat: "report" },
        sessionId:             "nonexistent-session",
        continueFromTranscript: ["prior turn"],
      });

    expect(res.status).toBe(403);
    expect(runBrainSession).not.toHaveBeenCalled();
  });

  it("allows the session owner to resume their own session", async () => {
    const mockDb = createMockDb({ "session-owned-by-A": { userId: "user-A" } });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid:           "user-A",
      emailVerified: true,
      admin:         true, // admin bypasses credit reservation so we don't need balance mocks
    });

    // Mock the brain run to write SSE data and end the connection
    vi.mocked(runBrainSession).mockImplementation(async ({ res, sessionId }: any) => {
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      return {
        sessionId: sessionId ?? "session-owned-by-A",
        creditsUsed: 0,
        model: "gpt-4",
        tokenUsage: { inputTokens: 10, outputTokens: 10 },
      } as any;
    });

    const res = await request(app)
      .post("/api/run-brain")
      .set("Authorization", "Bearer fake-token-for-A")
      .send({
        question:              "Continue my session",
        config:                { model: "gpt-4", litigantCount: 3, confidenceTarget: 80, responseMode: "balanced", outputFormat: "report" },
        sessionId:             "session-owned-by-A",
        continueFromTranscript: ["prior turn"],
      });

    // Should NOT be 403 — the session owner gets the SSE stream
    expect(res.status).not.toBe(403);
    expect(runBrainSession).toHaveBeenCalled();
  });
});
