import { Router } from "express";
import { verifyIdToken, isFirebaseConfigured, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { addCredits } from "../lib/creditLedger.js";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

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

    // Recent sessions (last 7 days)
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

// ── Users ─────────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ users: [] });

  const search = (req.query["search"] as string | undefined)?.toLowerCase();
  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = req.query["cursor"] as string | undefined;

  try {
    let q = db.collection("users").orderBy("createdAt", "desc").limit(limit + 1) as any;
    if (cursor) {
      const cursorDoc = await db.collection("users").doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    let users = snap.docs.map((d: any) => serializeDoc(d));
    const hasMore = users.length > limit;
    users = users.slice(0, limit);

    if (search) {
      users = users.filter((u: any) =>
        (u.email as string)?.toLowerCase().includes(search) ||
        (u.displayName as string)?.toLowerCase().includes(search)
      );
    }

    return res.json({ users, hasMore, nextCursor: hasMore ? users[users.length - 1]?.id : null });
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
      db.collection("credit_transactions")
        .where("userId", "==", req.params["uid"]!)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      db.collection("sessions")
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

/**
 * POST /admin/users/:uid/credits
 * Body: { amount: number, reason: string }
 * Adjusts credits by amount (positive = add, negative = deduct).
 * Creates an immutable ledger entry.
 */
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

    // Also disable/enable the Firebase Auth account
    try {
      await getAuth().updateUser(req.params["uid"]!, { disabled: banned });
    } catch {
      // Non-fatal if auth update fails
    }

    return res.json({ success: true, banned });
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
    let q = db.collection("sessions").orderBy("createdAt", "desc").limit(limit + 1) as any;
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

    // Attach session_turns
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

/**
 * POST /admin/credits/refund
 * Body: { userId: string, amount: number, reason: string }
 */
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

// ── Feature Flags (public read, admin write) ──────────────────────────────────

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

  const { value } = req.body as { value?: boolean };
  if (typeof value !== "boolean") {
    return res.status(400).json({ error: "value (boolean) is required" });
  }

  try {
    await db
      .collection("config")
      .doc("featureFlags")
      .set({ [req.params["name"]!]: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ success: true, name: req.params["name"], value });
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

  const { title, description, isActive, defaultSettings } = req.body as {
    title?: string;
    description?: string;
    isActive?: boolean;
    defaultSettings?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (typeof isActive === "boolean") updates["isActive"] = isActive;
  if (defaultSettings) updates["defaultSettings"] = defaultSettings;

  try {
    await db.collection("templates").doc(req.params["id"]!).set(updates, { merge: true });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const DEFAULT_FLAGS: Record<string, boolean> = {
  guestMode: true,
  proUpgrade: true,
  exportPdf: false,
  shareReports: true,
  templateLibrary: true,
  autoRefill: false,
};

export default router;
