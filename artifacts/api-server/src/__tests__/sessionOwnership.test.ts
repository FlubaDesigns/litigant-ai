/**
 * Session ownership tests.
 *
 * Verifies that a user cannot resume (or overwrite) a session they do not own.
 * User B supplying user A's sessionId in a resume request must receive HTTP 403
 * before any credits are reserved or AI calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../lib/sessionPricing.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/sessionPricing.js")>(),
  prepareSession: vi.fn(async (config: any) => {
    const {estimateSessionCreditsCalibrated} = await import("../lib/creditEngine.js");
    return {config, estimatedCredits: await estimateSessionCreditsCalibrated(config), rates: {"gpt-4":{input:.002,output:.008,multiplier:5,verifiedAt:"2026-10-05"}}, enabledProviders: ["openai"]};
  }),
  priceCalls: vi.fn(() => 100),
}));

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

vi.mock("../lib/creditEngine.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/creditEngine.js")>(),
  estimateSessionCreditsCalibrated: vi.fn(() => Promise.resolve(100)),
  estimateFixedPipelineCost:        vi.fn(() => 50),
  calculateActualCredits:           vi.fn(() => 100),
  getModelRate:                     vi.fn(() => ({ inputRate: 1, outputRate: 2 })),
}));


vi.mock("../lib/creditLedger.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/creditLedger.js")>(),
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

import app from "../app-firebase.js";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { runBrainSession } from "../lib/brainEngine.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal in-memory Firestore that handles the collections the brain route uses. */
function createMockDb(sessions: Record<string, any> = {}) {
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
    const mockDb = createMockDb({ "session-owned-by-A": { userId: "user-A", status: "incomplete" } });
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
    const mockDb = createMockDb({ "session-owned-by-A": { userId: "user-A", status: "incomplete" } });
    vi.mocked(getFirestoreDb).mockReturnValue(mockDb as any);
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid:           "user-A",
      emailVerified: true,
      admin:         true, // admin bypasses credit reservation so we don't need balance mocks
    });

    // Mock the brain run to write SSE data and end the connection
    vi.mocked(runBrainSession).mockImplementation(async ({ res, sessionId }: any) => {
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);

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


describe("accepting a saved partial answer", () => {
  const original = {
    userId: "owner", status: "paused_credit_cap", pauseReason: "credit_cap",
    finalAnswer: "Saved partial answer", transcript: "Saved evidence", debateNotes: "Saved notes",
    caveats: "Review still required", courtroomOutcome: { reason: "convergence_failure" },
    creditsUsed: 40, starred: true, shareId: "existing-link",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: "owner" } as any);
  });
  const accept = () => request(app).patch("/api/sessions/saved")
    .set("Authorization", "Bearer test-token").send({ status: "complete" });

  it.each(["paused_credit_cap", "incomplete"])("persists acceptance of %s and restores it on a fresh read", async status => {
    const db = createMockDb({ saved: { ...original, status } });
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    expect((await accept()).body).toMatchObject({ success: true, status: "complete" });
    const stored = (await db.collection("sessions").doc("saved").get()).data();
    expect(stored).toMatchObject({ ...original, status: "complete", pauseReason: null });
    expect(stored.acceptedAt).toBeDefined();
    expect(stored.updatedAt).toBeDefined();
    const fresh = await request(app).get("/api/sessions/saved").set("Authorization", "Bearer test-token");
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({ status: "complete", finalAnswer: original.finalAnswer, creditsUsed: 40 });
    expect(runBrainSession).not.toHaveBeenCalled();
    // A retry must not re-stamp acceptance or charge for another run.
    await accept();
    expect((await db.collection("sessions").doc("saved").get()).data()).toEqual(stored);
  });

  it.each(["running", "error", "relay_needed"])("rejects acceptance of %s", async status => {
    const db = createMockDb({ saved: { ...original, status } });
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    expect((await accept()).status).toBe(409);
    expect((await db.collection("sessions").doc("saved").get()).data().status).toBe(status);
  });

  it("rejects an empty answer", async () => {
    vi.mocked(getFirestoreDb).mockReturnValue(createMockDb({ saved: { ...original, finalAnswer: " " } }) as any);
    expect((await accept()).status).toBe(409);
  });

  it("requires the owner and a valid token", async () => {
    const db = createMockDb({ saved: original });
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    expect((await request(app).patch("/api/sessions/saved").send({ status: "complete" })).status).toBe(401);
    vi.mocked(verifyIdToken).mockResolvedValue(null);
    expect((await accept()).status).toBe(401);
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: "other-user" } as any);
    expect((await accept()).status).toBe(403);
    expect((await db.collection("sessions").doc("saved").get()).data()).toEqual(original);
  });

  it("does not confirm acceptance when the database write fails", async () => {
    const db = createMockDb({ saved: original });
    db.runTransaction = async () => { throw new Error("Storage unavailable"); };
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    expect((await accept()).status).toBe(500);
    expect((await db.collection("sessions").doc("saved").get()).data()).toEqual(original);
  });

  it("rejects arbitrary status updates and preserves ordinary metadata editing", async () => {
    const db = createMockDb({ saved: original });
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    const patch = (body: object) => request(app).patch("/api/sessions/saved").set("Authorization", "Bearer test-token").send(body);
    expect((await patch({ status: "running" })).status).toBe(400);
    expect((await patch({ title: "Renamed", starred: false, shared: false })).status).toBe(200);
    expect((await db.collection("sessions").doc("saved").get()).data()).toMatchObject({
      status: "paused_credit_cap", title: "Renamed", starred: false, shared: false, shareId: null,
    });
  });
});

describe("session failure telemetry", () => {
  const config = {model:"gpt-4",litigantCount:3,confidenceTarget:80,responseMode:"balanced",outputFormat:"report",maxCredits:500};
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyIdToken).mockResolvedValue({uid:"owner",emailVerified:true,admin:true});
  });
  const run = (extra:object={}) => request(app).post("/api/run-brain").set("Authorization","Bearer test-token").send({question:"Keep my question",config,...extra});
  it("saves new failures without storing upstream secrets", async () => {
    const db=createMockDb();
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    vi.mocked(runBrainSession).mockRejectedValue(new Error("upstream sensitive diagnostic"));
    expect((await run()).text).toContain('"type":"error"');
    const id=vi.mocked(runBrainSession).mock.calls[0][0].sessionId!;
    const saved=(await db.collection("sessions").doc(id).get()).data();
    expect(saved).toMatchObject({userId:"owner",status:"error",question:"Keep my question",creditsUsed:0,shared:false});
    expect(saved.lastRunErrorAt).toBeDefined();
    expect(saved.updatedAt).toBeDefined();
    expect(JSON.stringify(saved)).not.toContain("upstream sensitive diagnostic");
  });
  it("preserves the paused answer and releases its lease after a failed resume", async () => {
    const original={userId:"owner",status:"paused_credit_cap",finalAnswer:"Saved answer",transcript:"Saved transcript",creditsUsed:40,createdAt:"original-date"};
    const db=createMockDb({saved:original});
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    vi.mocked(runBrainSession).mockRejectedValue(new Error("Provider failed"));
    await run({sessionId:"saved",continueFromTranscript:["prior turn"]});
    const saved=(await db.collection("sessions").doc("saved").get()).data();
    expect(saved).toMatchObject({...original,activeRun:null});
    expect(saved.lastRunErrorAt).toBeDefined();
  });
  it("does not let a stale failed worker overwrite its successor", async () => {
    const db=createMockDb({saved:{userId:"owner",status:"incomplete",finalAnswer:"Old answer"}});
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    vi.mocked(runBrainSession).mockImplementation(async () => {
      await db.collection("sessions").doc("saved").update({finalAnswer:"Newer answer",activeRun:{id:"successor",expiresAt:Date.now()+60000}});
      throw new Error("Old worker failed");
    });
    await run({sessionId:"saved",continueFromTranscript:["prior turn"]});
    const saved=(await db.collection("sessions").doc("saved").get()).data();
    expect(saved.finalAnswer).toBe("Newer answer");
    expect(saved.activeRun.id).toBe("successor");
    expect(saved.lastRunErrorAt).toBeUndefined();
  });
  it("retains previous costs and records failed agent calls once on resume", async () => {
    const oldCall={seat:"Builder",provider:"openai",model:"old-model",inputTokens:10,outputTokens:10,costUSD:.5};
    const db=createMockDb({saved:{userId:"owner",status:"incomplete",finalAnswer:"Saved answer",costUSD:.5,callUsage:[oldCall]}});
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    vi.mocked(runBrainSession).mockImplementation(async opts => {
      opts.onCallUsage?.({seat:"Auditor",provider:"openai",model:"gpt-4",inputTokens:1000,outputTokens:1000,usageSource:"provider"});
      throw new Error("Failed after billed call");
    });
    await run({sessionId:"saved",continueFromTranscript:["prior turn"]});
    const saved=(await db.collection("sessions").doc("saved").get()).data();
    expect(saved.callUsage).toHaveLength(2);
    expect(saved.callUsage[0]).toEqual(oldCall);
    expect(saved.callUsage[1]).toMatchObject({seat:"Auditor",costUSD:.01,rateVerifiedAt:"2026-10-05"});
    expect(saved.costUSD).toBeCloseTo(.51);
    expect(saved.finalAnswer).toBe("Saved answer");
  });
  it("still refunds the reserved credits", async () => {
    const db=createMockDb();
    await db.collection("users").doc("owner").set({creditBalance:500});
    vi.mocked(getFirestoreDb).mockReturnValue(db as any);
    vi.mocked(verifyIdToken).mockResolvedValue({uid:"owner",emailVerified:true});
    vi.mocked(runBrainSession).mockRejectedValue(new Error("Provider failed"));
    await run();
    expect(runBrainSession).toHaveBeenCalled();
    expect((await db.collection("users").doc("owner").get()).data().creditBalance).toBe(500);
  });
});

describe("system health metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyIdToken).mockResolvedValue({uid:"owner",admin:true});
  });
  function healthDb(failField?:string,empty=false) {
    const now=new Date(),old=new Date(Date.now()-30*86400000);
    const records:Record<string,any[]>={users:[{id:"owner"}],credit_transactions:[{id:"tx"}],feedback:[],sessions:empty?[]:[
      {id:"resumed",createdAt:old,updatedAt:now,lastRunErrorAt:now,lastRunErrorMessage:"Session failed before completion.",status:"paused_credit_cap"},
      {id:"success",createdAt:now,updatedAt:now,status:"complete"},
      {id:"old-error",createdAt:old,updatedAt:old,lastRunErrorAt:old,status:"error"},
    ]};
    function query(rows:any[],error=false):any {
      return {
        where:(field:string,_op:string,value:Date)=>query(rows.filter(row=>row[field]>=value),field===failField),
        count:()=>({get:async()=>{if(error)throw new Error("Query unavailable");return {data:()=>({count:rows.length})};}}),
        orderBy:(field:string)=>query(rows.filter(row=>row[field]).sort((a,b)=>b[field]-a[field])),
        limit:(n:number)=>query(rows.slice(0,n)),
        get:async()=>({docs:rows.map(row=>({id:row.id,data:()=>row}))}),
      };
    }
    return {collection:(name:string)=>query(records[name]??[])};
  }
  const health=()=>request(app).get("/api/admin/system-health").set("Authorization","Bearer test-token");
  it("counts old resumed sessions in the recent activity window and error logs", async () => {
    vi.mocked(getFirestoreDb).mockReturnValue(healthDb() as any);
    const response=await health();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({status:"ok",collections:{sessions:3},last24h:{newSessions:1},last7d:{errorSessions:1,activeSessions:2,errorRate:"50.0",feedbackEntries:0}});
    const logs=await request(app).get("/api/admin/error-logs").set("Authorization","Bearer test-token");
    expect(logs.body.failedSessions.map((row:any)=>row.id)).toContain("resumed");
  });
  it.each(["lastRunErrorAt","updatedAt"])("returns unavailable when %s cannot be read",async field=>{
    vi.mocked(getFirestoreDb).mockReturnValue(healthDb(field) as any);
    expect((await health()).body).toMatchObject({status:"degraded",collections:{sessions:3},last7d:{errorSessions:null,activeSessions:null,errorRate:null}});
  });
  it("does not invent a rate when no sessions exist",async()=>{
    vi.mocked(getFirestoreDb).mockReturnValue(healthDb(undefined,true) as any);
    expect((await health()).body.last7d).toMatchObject({errorSessions:0,activeSessions:0,errorRate:null});
  });
});
