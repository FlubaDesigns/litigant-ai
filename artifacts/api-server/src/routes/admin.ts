import { Router } from "express";
import { verifyIdToken, isFirebaseConfigured, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { addCredits } from "../lib/creditLedger.js";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  getAdminPricingTable,
  saveMultiplierOverride,
  resetMultiplierToDefault,
} from "../lib/pricingConfig.js";
import {
  getAllConfiguredProviders,
  saveApiKey,
  deleteApiKey,
} from "../lib/apiKeyStore.js";
import {
  CANON_V2_FALLBACK_TEXT,
  CANON_V2_FALLBACK_VERSION,
  invalidateConscienceCache,
} from "../lib/conscienceConfig.js";
import {
  SEAT_IDS,
  getAllSeatBriefs,
  getSeatBriefFileDefault,
  invalidateSeatBriefsCache,
  type SeatId,
} from "../lib/seatBriefs.js";

const router = Router();

// ── Admin auth middleware ─────────────────────────────────────────────────────

async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!isFirebaseConfigured()) {
    res.status(503).json({ error: "Firebase not configured" });
    return;
  }
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded?.admin) {
    res.status(403).json({ error: "Forbidden — admin access required" });
    return;
  }
  req.adminUid = decoded.uid;
  next();
}

function serializeDoc(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const data = doc.data() ?? {};
  const out: Record<string, unknown> = { id: doc.id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as any).toDate === "function") {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Bootstrap: set admin claim (master-secret gated, no token required) ───────

/**
 * POST /admin/set-claim
 * Body: { secret: string, email?: string, uid?: string }
 * No Bearer token required — authenticated by ADMIN_MASTER_SECRET env var.
 * Sets admin: true custom claim on the target Firebase Auth user.
 * User must sign out and back in for the claim to appear in their ID token.
 */
router.post("/admin/set-claim", async (req, res) => {
  const masterSecret = process.env["ADMIN_MASTER_SECRET"];
  if (!masterSecret) {
    return res.status(503).json({
      error: "ADMIN_MASTER_SECRET is not set. Configure this env var on the server first.",
    });
  }
  if (!isFirebaseConfigured()) {
    return res.status(503).json({ error: "Firebase not configured" });
  }

  const { secret, email, uid } = req.body as {
    secret?: string;
    email?: string;
    uid?: string;
  };

  if (secret !== masterSecret) {
    return res.status(403).json({ error: "Invalid master secret" });
  }
  if (!email && !uid) {
    return res.status(400).json({ error: "email or uid required" });
  }

  try {
    const authAdmin = getAuth();
    const user = email
      ? await authAdmin.getUserByEmail(email)
      : await authAdmin.getUser(uid!);

    const existing = user.customClaims ?? {};
    if (existing["admin"] === true) {
      return res.json({
        success: true,
        uid: user.uid,
        email: user.email,
        message: "User already has admin: true — no change made.",
      });
    }

    await authAdmin.setCustomUserClaims(user.uid, { ...existing, admin: true });
    return res.json({
      success: true,
      uid: user.uid,
      email: user.email,
      message: "admin: true set. User must sign out and sign back in for the claim to appear.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── System stats ──────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ userCount: 0, sessionCount: 0, txCount: 0 });

  try {
    const [usersSnap, sessionsSnap, txSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("sessions").count().get(),
      db.collection("credit_transactions").count().get(),
    ]);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentSnap = await db
      .collection("sessions")
      .where("createdAt", ">=", since)
      .count()
      .get();

    return res.json({
      userCount: usersSnap.data().count,
      sessionCount: sessionsSnap.data().count,
      txCount: txSnap.data().count,
      recentSessions: recentSnap.data().count,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── System Health ─────────────────────────────────────────────────────────────

router.get("/admin/system-health", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ status: "unavailable", reason: "Firebase not configured" });

  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userCount, sessionCount, txCount,
      recentSessions, errorSessions, feedbackCount, sessions7d,
    ] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("sessions").count().get(),
      db.collection("credit_transactions").count().get(),
      db.collection("sessions").where("createdAt", ">=", last24h).count().get(),
      db.collection("sessions").where("status", "==", "error").where("createdAt", ">=", last7d).count().get(),
      db.collection("feedback").where("createdAt", ">=", last7d).count().get(),
      // Scoped to the same 7-day window as errorSessions so the error rate
      // reflects recent behaviour rather than dividing by the all-time total.
      db.collection("sessions").where("createdAt", ">=", last7d).count().get(),
    ]);

    const sessionCount7d = sessions7d.data().count;
    const errorCount7d   = errorSessions.data().count;

    return res.json({
      status: "ok",
      serverTime: new Date().toISOString(),
      collections: {
        users: userCount.data().count,
        sessions: sessionCount.data().count,
        credit_transactions: txCount.data().count,
      },
      last24h: {
        newSessions: recentSessions.data().count,
      },
      last7d: {
        errorSessions: errorCount7d,
        feedbackEntries: feedbackCount.data().count,
        // Denominator is 7-day session total, not lifetime total.
        // Using the lifetime total would trend the rate toward zero as the
        // product ages, masking real spikes in recent error counts.
        errorRate: sessionCount7d > 0
          ? ((errorCount7d / sessionCount7d) * 100).toFixed(1)
          : "0.0",
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ users: [] });

  const search = (req.query["search"] as string | undefined)?.toLowerCase();
  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = req.query["cursor"] as string | undefined;

  try {
    let q: FirebaseFirestore.Query;

    if (search && search.includes("@")) {
      // Email range query — proper server-side search by email prefix
      q = db
        .collection("users")
        .where("email", ">=", search)
        .where("email", "<=", search + "\uf8ff")
        .limit(limit + 1);
    } else if (search) {
      // Name search: fetch a larger page and filter client-side
      q = db.collection("users").orderBy("createdAt", "desc").limit(200);
    } else {
      q = db.collection("users").orderBy("createdAt", "desc").limit(limit + 1);
      if (cursor) {
        const cursorDoc = await db.collection("users").doc(cursor).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc) as any;
      }
    }

    const snap = await q.get();
    let users = snap.docs.map((d) => serializeDoc(d));

    if (search && !search.includes("@")) {
      users = users.filter(
        (u: any) =>
          (u.email as string)?.toLowerCase().includes(search) ||
          (u.displayName as string)?.toLowerCase().includes(search)
      );
    }

    // Apply limit and hasMore consistently across all branches.
    // For name searches the source window is the 200 most-recent accounts —
    // boundedSearch:true tells the caller the result may be incomplete
    // (older accounts that match won't appear) rather than implying it's exhaustive.
    const hasMore = users.length > limit;
    const boundedSearch = !!(search && !search.includes("@"));
    users = users.slice(0, limit);

    return res.json({
      users,
      hasMore,
      nextCursor: hasMore ? users[users.length - 1]?.id : null,
      ...(boundedSearch ? { boundedSearch: true } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admin/users/:uid", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(404).json({ error: "Not found" });

  try {
    const [userDoc, txSnap, sessionsSnap] = await Promise.all([
      db.collection("users").doc(req.params["uid"]!).get(),
      db
        .collection("credit_transactions")
        .where("userId", "==", req.params["uid"]!)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      db
        .collection("sessions")
        .where("userId", "==", req.params["uid"]!)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get(),
    ]);

    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    return res.json({
      user: serializeDoc(userDoc),
      recentTransactions: txSnap.docs.map((d) => serializeDoc(d)),
      recentSessions: sessionsSnap.docs.map((d) => serializeDoc(d)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/admin/users/:uid/credits", requireAdmin, async (req: any, res) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ error: "amount (number) is required" });
  }

  try {
    const result = await addCredits(req.params["uid"]!, amount, "admin_adjustment", {
      source: reason ?? `admin_adjustment_by_${req.adminUid as string}`,
    });
    if (!result) return res.status(503).json({ error: "Firebase not configured" });
    return res.json({ success: true, newBalance: result.newBalance });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/users/:uid/ban
 * Body: { banned: boolean, reason?: string }
 * Sets Firestore flag + disables Firebase Auth account.
 * Returns authWarning if the Firebase Auth update fails (Firestore flag was still set).
 */
router.post("/admin/users/:uid/ban", requireAdmin, async (req: any, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { banned, reason } = req.body as { banned?: boolean; reason?: string };
  if (typeof banned !== "boolean") {
    return res.status(400).json({ error: "banned (boolean) is required" });
  }

  try {
    await db
      .collection("users")
      .doc(req.params["uid"]!)
      .set(
        {
          banned,
          bannedReason: reason ?? null,
          bannedAt: banned ? FieldValue.serverTimestamp() : null,
          bannedBy: req.adminUid as string,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    let authWarning: string | null = null;
    try {
      await getAuth().updateUser(req.params["uid"]!, { disabled: banned });
    } catch (authErr: any) {
      authWarning = `Firestore flag was set, but Firebase Auth account update failed: ${authErr.message}. The user can still sign in.`;
    }

    return res.json({
      success: true,
      banned,
      ...(authWarning ? { authWarning } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get("/admin/sessions", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ sessions: [] });

  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = req.query["cursor"] as string | undefined;
  const userId = req.query["userId"] as string | undefined;
  const templateId = req.query["templateId"] as string | undefined;
  const status = req.query["status"] as string | undefined;

  try {
    let q = db
      .collection("sessions")
      .orderBy("createdAt", "desc")
      .limit(limit + 1) as any;
    if (userId) q = q.where("userId", "==", userId);
    if (templateId) q = q.where("templateId", "==", templateId);
    if (status) q = q.where("status", "==", status);
    if (cursor) {
      const cursorDoc = await db.collection("sessions").doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    return res.json({
      sessions: docs.map((d: any) => serializeDoc(d)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admin/sessions/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(404).json({ error: "Not found" });

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists) return res.status(404).json({ error: "Session not found" });

    const data = serializeDoc(doc);
    const turnsSnap = await doc.ref.collection("session_turns").orderBy("turnIndex").get();
    const turns = turnsSnap.docs.map((t) => serializeDoc(t));

    return res.json({ session: data, turns });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

router.get("/admin/transactions", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ transactions: [] });

  const limit = Math.min(Number(req.query["limit"]) || 30, 100);
  const cursor = req.query["cursor"] as string | undefined;
  const userId = req.query["userId"] as string | undefined;
  const type = req.query["type"] as string | undefined;

  try {
    let q = db
      .collection("credit_transactions")
      .orderBy("createdAt", "desc")
      .limit(limit + 1) as any;
    if (userId) q = q.where("userId", "==", userId);
    if (type) q = q.where("type", "==", type);
    if (cursor) {
      const cursorDoc = await db.collection("credit_transactions").doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    return res.json({
      transactions: docs.map((d: any) => serializeDoc(d)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/admin/credits/refund", requireAdmin, async (req: any, res) => {
  const { userId, amount, reason } = req.body as {
    userId?: string;
    amount?: number;
    reason?: string;
  };
  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: "userId and amount (positive) are required" });
  }

  try {
    const result = await addCredits(userId, amount, "refund", {
      source: reason ?? `admin_refund_by_${req.adminUid as string}`,
    });
    if (!result) return res.status(503).json({ error: "Firebase not configured" });
    return res.json({ success: true, newBalance: result.newBalance });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── API Usage ─────────────────────────────────────────────────────────────────

router.get("/admin/api-usage", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ byDay: [], totalSessions: 0, totalCreditsUsed: 0, apiLogs: [] });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const usageSnap = await db
      .collection("credit_transactions")
      .where("type", "==", "usage")
      .where("createdAt", ">=", since)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    const byDay: Record<string, { date: string; sessions: number; creditsUsed: number }> = {};
    for (const doc of usageSnap.docs) {
      const data = doc.data();
      const date =
        data["createdAt"]?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? "unknown";
      if (!byDay[date]) byDay[date] = { date, sessions: 0, creditsUsed: 0 };
      byDay[date]!.sessions++;
      byDay[date]!.creditsUsed += Math.abs((data["amount"] as number) ?? 0);
    }

    // Also read from api_logs if it exists (may be empty until brain.ts writes there)
    let apiLogs: Record<string, unknown>[] = [];
    try {
      const logsSnap = await db
        .collection("api_logs")
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();
      apiLogs = logsSnap.docs.map((d) => serializeDoc(d));
    } catch {
      /* api_logs collection may not exist yet */
    }

    const byDayArr = Object.values(byDay).sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    return res.json({
      byDay: byDayArr,
      totalSessions: usageSnap.size,
      totalCreditsUsed: byDayArr.reduce((s, d) => s + d.creditsUsed, 0),
      apiLogs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Error Logs ────────────────────────────────────────────────────────────────

router.get("/admin/error-logs", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ logs: [], failedSessions: [] });

  const limit = Math.min(Number(req.query["limit"]) || 50, 200);

  try {
    // Read from api_logs (may be empty until brain.ts writes there)
    let logs: Record<string, unknown>[] = [];
    try {
      const snap = await db
        .collection("api_logs")
        .where("status", "==", "error")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      logs = snap.docs.map((d) => serializeDoc(d));
    } catch {
      /* api_logs may not exist */
    }

    // Sessions with error status are always a useful error signal
    const failedSnap = await db
      .collection("sessions")
      .where("status", "==", "error")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    return res.json({
      logs,
      failedSessions: failedSnap.docs.map((d) => ({
        ...serializeDoc(d),
        _type: "session_error",
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Abuse Flags ───────────────────────────────────────────────────────────────

router.get("/admin/abuse-flags", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ flags: [], totalCount: 0 });

  const limit = Math.min(Number(req.query["limit"]) || 50, 200);

  try {
    const snap = await db
      .collection("feedback")
      .where("rating", "in", ["bad", "warn"])
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return res.json({
      flags: snap.docs.map((d) => serializeDoc(d)),
      totalCount: snap.size,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Feature Flags (public read, admin write) ──────────────────────────────────

const DEFAULT_FLAGS: Record<string, boolean> = {
  guestMode: true,
  proUpgrade: true,
  exportPdf: false,
  shareReports: true,
  templateLibrary: true,
  autoRefill: false,
};

router.get("/feature-flags", async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ flags: DEFAULT_FLAGS });

  try {
    const doc = await db.collection("config").doc("featureFlags").get();
    if (!doc.exists) return res.json({ flags: DEFAULT_FLAGS });
    return res.json({ flags: { ...DEFAULT_FLAGS, ...(doc.data() ?? {}) } });
  } catch {
    return res.json({ flags: DEFAULT_FLAGS });
  }
});

router.put("/admin/feature-flags/:name", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const name  = req.params["name"]!;
  const { value } = req.body as { value?: unknown };
  const validFlags  = Object.keys(DEFAULT_FLAGS);
  const VALID_SCOPES = new Set(["all", "pro", "free"]);

  if (name.endsWith("_scope")) {
    // Scope flags (e.g. "guestMode_scope") — value must be a valid plan scope string.
    const baseName = name.slice(0, -"_scope".length);
    if (!validFlags.includes(baseName)) {
      return res.status(400).json({
        error: `Unknown scope flag "${name}". Valid base flags: ${validFlags.join(", ")}`,
      });
    }
    if (typeof value !== "string" || !VALID_SCOPES.has(value)) {
      return res.status(400).json({
        error: `Scope value must be one of: ${[...VALID_SCOPES].join(", ")}`,
      });
    }
  } else {
    // Boolean feature flags — name must be in DEFAULT_FLAGS, value must be boolean.
    if (!validFlags.includes(name)) {
      return res.status(400).json({
        error: `Unknown flag "${name}". Valid flags: ${validFlags.join(", ")}`,
      });
    }
    if (typeof value !== "boolean") {
      return res.status(400).json({ error: "value must be a boolean (true or false)" });
    }
  }

  try {
    await db
      .collection("config")
      .doc("featureFlags")
      .set(
        { [name]: value, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    return res.json({ success: true, name, value });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin Limits (public read, admin write) ───────────────────────────────────
//
// Numeric platform limits controlled from the admin centre.
// Stored in Firestore config/adminLimits. Defaults apply when the document
// doesn't exist or Firestore is unavailable (fail-open, not fail-closed).

const DEFAULT_LIMITS: Record<string, number> = {
  maxLitigants: 10,
};

const LIMIT_RANGES: Record<string, { min: number; max: number }> = {
  maxLitigants: { min: 2, max: 20 },
};

// Public — the frontend needs this before auth to render pickers correctly.
router.get("/limits", async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ limits: DEFAULT_LIMITS });
  try {
    const doc = await db.collection("config").doc("adminLimits").get();
    if (!doc.exists) return res.json({ limits: DEFAULT_LIMITS });
    return res.json({ limits: { ...DEFAULT_LIMITS, ...(doc.data() ?? {}) } });
  } catch {
    return res.json({ limits: DEFAULT_LIMITS });
  }
});

router.put("/admin/limits/:name", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const name  = req.params["name"]!;
  const { value } = req.body as { value?: unknown };

  if (!(name in DEFAULT_LIMITS)) {
    return res.status(400).json({
      error: `Unknown limit "${name}". Valid limits: ${Object.keys(DEFAULT_LIMITS).join(", ")}`,
    });
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return res.status(400).json({ error: "value must be an integer" });
  }
  const range = LIMIT_RANGES[name]!;
  if (value < range.min || value > range.max) {
    return res.status(400).json({
      error: `${name} must be between ${range.min} and ${range.max}`,
    });
  }

  try {
    await db
      .collection("config")
      .doc("adminLimits")
      .set({ [name]: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ success: true, name, value });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Canon / Conscience Config ─────────────────────────────────────────────────

/**
 * GET /admin/conscience
 * Returns the current conscience clause stored in Firestore, or the Canon v2
 * fallback if the document doesn't exist yet.
 */
router.get("/admin/conscience", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  try {
    const doc = await db.collection("system_config").doc("conscience").get();

    if (!doc.exists) {
      return res.json({
        exists: false,
        version: CANON_V2_FALLBACK_VERSION,
        text: CANON_V2_FALLBACK_TEXT,
        updatedAt: null,
        updatedBy: null,
        note: "No Firestore document found — Canon v2 fallback is in use.",
      });
    }

    return res.json({ exists: true, ...serializeDoc(doc) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /admin/conscience
 * Body: { text: string, version?: string }
 * Writes a new conscience clause to Firestore and invalidates the local cache.
 * All new sessions on this instance will pick up the new text immediately;
 * other Cloud Run instances will pick it up within 5 minutes (TTL window).
 */
router.patch("/admin/conscience", requireAdmin, async (req: any, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { text, version } = req.body as { text?: string; version?: string };

  if (!text?.trim()) {
    return res.status(400).json({ error: "text (string) is required and must not be empty" });
  }

  const newVersion = version?.trim() || `v-${new Date().toISOString().slice(0, 10)}`;

  try {
    await db.collection("system_config").doc("conscience").set({
      text: text.trim(),
      version: newVersion,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.adminUid as string,
    });

    // Invalidate this instance's cache immediately
    invalidateConscienceCache();

    return res.json({
      success: true,
      version: newVersion,
      note: "This instance cache cleared. Other Cloud Run instances update within 5 minutes.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Templates ─────────────────────────────────────────────────────────────────

router.get("/admin/templates", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ templates: [] });

  try {
    const snap = await db.collection("templates").orderBy("title").get();
    return res.json({ templates: snap.docs.map((d) => serializeDoc(d)) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/admin/templates/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { title, description, isActive, systemPrompt, defaultSettings } = req.body as {
    title?: string;
    description?: string;
    isActive?: boolean;
    systemPrompt?: string;
    defaultSettings?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (typeof isActive === "boolean") updates["isActive"] = isActive;
  if (systemPrompt !== undefined) updates["systemPrompt"] = systemPrompt;
  if (defaultSettings) updates["defaultSettings"] = defaultSettings;

  try {
    await db.collection("templates").doc(req.params["id"]!).set(updates, { merge: true });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Pricing / Multiplier Config ───────────────────────────────────────────────

router.get("/admin/pricing", requireAdmin, async (_req, res) => {
  try {
    const table = await getAdminPricingTable();
    return res.json(table);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/admin/pricing/:model", requireAdmin, async (req, res) => {
  const { model } = req.params as { model: string };
  const { multiplier } = req.body as { multiplier?: number };

  if (multiplier === undefined || isNaN(Number(multiplier))) {
    return res.status(400).json({ error: "multiplier (number) is required" });
  }
  const value = Number(multiplier);
  if (value < 1 || value > 100) {
    return res.status(400).json({ error: "multiplier must be between 1 and 100" });
  }

  try {
    await saveMultiplierOverride(model, value);
    return res.json({ success: true, model, multiplier: value });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/admin/pricing/:model", requireAdmin, async (req, res) => {
  const { model } = req.params as { model: string };
  try {
    await resetMultiplierToDefault(model);
    return res.json({ success: true, model, reset: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── API Key Management ────────────────────────────────────────────────────────

/** GET /admin/api-keys — list all configured providers (masked keys only) */
router.get("/admin/api-keys", requireAdmin, async (_req, res) => {
  try {
    const providers = await getAllConfiguredProviders();
    return res.json({ providers });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PUT /admin/api-keys/:providerId — save or update a provider's API key */
router.put("/admin/api-keys/:providerId", requireAdmin, async (req, res) => {
  const { providerId } = req.params as { providerId: string };
  const { key, label, baseUrl } = req.body as {
    key?: string;
    label?: string;
    baseUrl?: string;
  };

  if (!key || typeof key !== "string" || key.trim().length < 8) {
    return res.status(400).json({ error: "key must be a non-empty string (min 8 chars)" });
  }
  if (!label || typeof label !== "string" || label.trim().length === 0) {
    return res.status(400).json({ error: "label is required" });
  }

  const sanitizedId = providerId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  try {
    await saveApiKey(sanitizedId, key.trim(), label.trim(), baseUrl?.trim() || undefined);
    return res.json({ success: true, providerId: sanitizedId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** DELETE /admin/api-keys/:providerId — remove Firestore override (env var fallback still applies) */
router.delete("/admin/api-keys/:providerId", requireAdmin, async (req, res) => {
  const { providerId } = req.params as { providerId: string };
  try {
    await deleteApiKey(providerId);
    return res.json({ success: true, providerId, note: "env var fallback still applies if set" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Seat Briefs ───────────────────────────────────────────────────────────────

/**
 * GET /admin/seat-briefs
 * Returns all seat briefs — active (Firestore override or file fallback) plus
 * the factory-default file text for comparison.
 */
router.get("/admin/seat-briefs", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();

  try {
    const active = await getAllSeatBriefs();
    const defaults: Record<string, string> = {};
    for (const id of SEAT_IDS) {
      defaults[id] = getSeatBriefFileDefault(id);
    }

    let overrides: Record<string, unknown> = {};
    if (db) {
      const doc = await db.collection("system_config").doc("seat_briefs").get();
      if (doc.exists) overrides = doc.data() ?? {};
    }

    return res.json({
      active,
      defaults,
      overrides,
      seatIds: SEAT_IDS,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /admin/seat-briefs/:seatId
 * Body: { text: string }
 * Writes an override for a single seat brief to Firestore and invalidates cache.
 */
router.patch("/admin/seat-briefs/:seatId", requireAdmin, async (req: any, res) => {
  const { seatId } = req.params as { seatId: string };
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  if (!SEAT_IDS.includes(seatId as SeatId)) {
    return res.status(400).json({
      error: `Invalid seatId. Must be one of: ${SEAT_IDS.join(", ")}`,
    });
  }

  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    return res.status(400).json({ error: "text (string) is required and must not be empty" });
  }

  try {
    await db.collection("system_config").doc("seat_briefs").set(
      {
        [seatId]: text.trim(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.adminUid as string,
      },
      { merge: true }
    );

    invalidateSeatBriefsCache();

    return res.json({ success: true, seatId, length: text.trim().length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /admin/seat-briefs/:seatId
 * Removes the Firestore override for a seat — reverts to the file default.
 */
router.delete("/admin/seat-briefs/:seatId", requireAdmin, async (req: any, res) => {
  const { seatId } = req.params as { seatId: string };
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  if (!SEAT_IDS.includes(seatId as SeatId)) {
    return res.status(400).json({ error: `Invalid seatId` });
  }

  try {
    await db.collection("system_config").doc("seat_briefs").set(
      { [seatId]: FieldValue.delete() },
      { merge: true }
    );

    invalidateSeatBriefsCache();

    return res.json({
      success: true,
      seatId,
      note: "Firestore override removed — file default is now active",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
