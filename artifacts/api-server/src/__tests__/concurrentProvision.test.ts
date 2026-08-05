/**
 * Concurrent provisioning tests.
 *
 * Two simultaneous POST /auth/provision calls for the same UID must produce:
 *   • exactly one user profile document (no double-write / balance clobber)
 *   • exactly one signup bonus grant (grantSignupBonus idempotent)
 *
 * The mock Firestore serialises transactions (a mutex-style lock) so that the
 * second transaction always sees the result of the first — mirroring real
 * Firestore's serialisable isolation guarantee.
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

vi.mock("../lib/creditLedger.js", () => ({
  grantSignupBonus: vi.fn(),
}));

vi.mock("../lib/emailService.js", () => ({
  sendVerificationEmail:  vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail:       vi.fn(),
  isResendConfigured:     vi.fn(() => false),
}));

vi.mock("../lib/rateLimiter.js", () => ({
  makeRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
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
import { grantSignupBonus } from "../lib/creditLedger.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates an in-memory Firestore mock whose runTransaction() is serialised via
 * a Promise mutex — matching Firestore's serialisable isolation semantics.
 *
 * Writes inside a transaction are buffered and only committed after the
 * transaction function resolves, so the second concurrent transaction always
 * observes the first one's writes.
 */
function createSerializedMockDb() {
  const store: Record<string, any> = {};
  let txLock: Promise<void> = Promise.resolve();

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
    };
  };

  return {
    _store: store,
    collection: (name: string) => ({
      doc: (id?: string) => makeDocRef(name, id ?? `auto_${Math.random()}`),
    }),
    runTransaction: <T>(fn: (txn: any) => Promise<T>): Promise<T> => {
      // Chain execution on the lock so each transaction runs strictly after the
      // previous one commits — this mirrors Firestore's serialisable isolation.
      const run = txLock.then(async (): Promise<T> => {
        const pending: Array<{ key: string; data: any; op: "set" | "update" }> = [];

        const txn = {
          get:    async (ref: any)             => ref._get(),
          set:    (ref: any, data: any)         => pending.push({ key: ref._key, data, op: "set" }),
          update: (ref: any, data: any)         => pending.push({ key: ref._key, data, op: "update" }),
        };

        const result = await fn(txn);

        // Commit buffered writes atomically after the txn function resolves.
        for (const { key, data, op } of pending) {
          if (op === "set")    store[key] = data;
          else                 store[key] = { ...store[key], ...data };
        }

        return result;
      });

      // Advance the lock (ignoring errors so a failed txn doesn't permanently
      // block subsequent transactions — mirrors Firestore retry behaviour).
      txLock = run.then(() => {}, () => {}) as unknown as Promise<void>;
      return run;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const TEST_UID   = "user-concurrent-001";
const FAKE_TOKEN = "fake-token";

describe("Concurrent /auth/provision calls", () => {
  let mockDb: ReturnType<typeof createSerializedMockDb>;
  const grantedUids = new Set<string>();

  beforeEach(() => {
    vi.clearAllMocks();
    grantedUids.clear();
    mockDb = createSerializedMockDb();

    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);

    vi.mocked(verifyIdToken).mockResolvedValue({
      uid:           TEST_UID,
      email:         "concurrent@test.com",
      emailVerified: true,
    });

    // Idempotent mock: first call for a UID grants the bonus; subsequent calls skip.
    vi.mocked(grantSignupBonus).mockImplementation((uid: string) => {
      // Synchronous check-and-add before the first await so concurrent Node.js
      // tasks cannot interleave between the read and the write.
      if (grantedUids.has(uid)) {
        return Promise.resolve({ skipped: true, amount: 0 });
      }
      grantedUids.add(uid);
      return Promise.resolve({ skipped: false, amount: 500 });
    });
  });

  it("produces exactly one user profile and one bonus grant under concurrency", async () => {
    // Fire both requests simultaneously — Promise.all lets them race.
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/auth/provision")
        .set("Authorization", `Bearer ${FAKE_TOKEN}`)
        .send({}),
      request(app)
        .post("/api/auth/provision")
        .set("Authorization", `Bearer ${FAKE_TOKEN}`)
        .send({}),
    ]);

    // Both requests must succeed
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.provisioned).toBe(true);
    expect(res2.body.provisioned).toBe(true);

    // Exactly one request should have created the user doc
    const newUserCount = [res1.body.newUser, res2.body.newUser].filter(Boolean).length;
    expect(newUserCount).toBe(1);

    // Exactly one user document must exist in the store
    const userKeys = Object.keys(mockDb._store).filter(k => k.startsWith("users/"));
    expect(userKeys).toHaveLength(1);

    // Exactly one bonus must have been granted
    const bonusGrantedCount = [res1.body.bonusGranted, res2.body.bonusGranted].filter(Boolean).length;
    expect(bonusGrantedCount).toBe(1);

    // grantSignupBonus called once per request but only one should succeed
    expect(grantSignupBonus).toHaveBeenCalledTimes(2);
    const callResults = await Promise.all(
      vi.mocked(grantSignupBonus).mock.results.map(r =>
        r.type === "return" ? r.value : Promise.resolve({ skipped: true, amount: 0 })
      )
    );
    const skippedCount  = callResults.filter(r => r.skipped).length;
    const grantedCount  = callResults.filter(r => !r.skipped).length;
    expect(grantedCount).toBe(1);
    expect(skippedCount).toBe(1);
  });

  it("is idempotent for sequential calls (second call sees existing user)", async () => {
    const res1 = await request(app)
      .post("/api/auth/provision")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send({});

    const res2 = await request(app)
      .post("/api/auth/provision")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`)
      .send({});

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // First call creates, second call is a no-op
    expect(res1.body.newUser).toBe(true);
    expect(res2.body.newUser).toBe(false);

    // User doc exists exactly once
    const userKeys = Object.keys(mockDb._store).filter(k => k.startsWith("users/"));
    expect(userKeys).toHaveLength(1);
  });
});
