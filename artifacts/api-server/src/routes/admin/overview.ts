import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { safeError } from "../../lib/safeError.js";
import { summarizeApiUsage } from "../../lib/apiUsage.js";
import { requireAdmin, serializeDoc } from "./shared.js";

const router = Router();


// Administrator setup uses scripts/src/set-admin-claim.ts with Google IAM.
// There is no public password-based claim-grant endpoint.

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
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── System Health ─────────────────────────────────────────────────────────────

router.get("/admin/system-health", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ status: "unavailable", reason: "Firebase not configured" });

  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userCount, sessionCount, txCount,
      recentSessions, feedbackCount,
    ] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("sessions").count().get(),
      db.collection("credit_transactions").count().get(),
      db.collection("sessions").where("createdAt", ">=", last24h).count().get(),
      db.collection("feedback").where("createdAt", ">=", last7d).count().get(),
    ]);

    // Include resumed sessions in the same activity window as their failures.
    // Count each session once, even when it has several failed attempts.
    let errorCount7d: number | null = null;
    let sessionCount7d: number | null = null;
    try {
      const [errors, active] = await Promise.all([
        db.collection("sessions").where("lastRunErrorAt", ">=", last7d).count().get(),
        db.collection("sessions").where("updatedAt", ">=", last7d).count().get(),
      ]);
      errorCount7d = errors.data().count;
      sessionCount7d = active.data().count;
    } catch {
      // Unknown is never represented as zero or a healthy result.
    }

    return res.json({
      status: errorCount7d === null || sessionCount7d === null || errorCount7d > 0 ? "degraded" : "ok",
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
        activeSessions: sessionCount7d,
        errorRate: errorCount7d !== null && sessionCount7d !== null && sessionCount7d > 0
          ? ((errorCount7d / sessionCount7d) * 100).toFixed(1)
          : null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── API Usage ─────────────────────────────────────────────────────────────────

router.get("/admin/api-usage", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Usage data is unavailable" });
  const through = new Date();
  const since = new Date(through.getTime() - 30 * 24 * 60 * 60 * 1000);
  const limit = 1000;
  try {
    // Read the same per-call cost snapshots and settled credits saved by brain.ts.
    // Projection avoids loading questions, transcripts or other session content.
    const snap = await db.collection("sessions")
      .where("createdAt", ">=", since).where("createdAt", "<=", through)
      .orderBy("createdAt", "desc")
      .select("createdAt", "creditsUsed", "callUsage", "status")
      .limit(limit + 1).get();
    return res.json({
      ...summarizeApiUsage(snap.docs.slice(0, limit).map(doc => doc.data())),
      apiLogs: [], // Compatibility for open tabs running the previous frontend.
      since: since.toISOString(), through: through.toISOString(),
      truncated: snap.size > limit, limit,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── Error Logs ────────────────────────────────────────────────────────────────

router.get("/admin/error-logs", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Error records are unavailable" });

  const limit = Math.max(1, Math.min(Math.floor(Number(req.query["limit"])) || 50, 200));

  try {
    // Preserve historical API error records. Current execution failures are
    // written to the session marker below. Read failures must not look empty.
    const logsSnap = await db.collection("api_logs")
      .where("status", "==", "error").orderBy("createdAt", "desc")
      .limit(limit + 1).get();
    const logs = logsSnap.docs.slice(0, limit).map(d => serializeDoc(d));

    // The same failure marker used by System Health, including failed resumes.
    const failedSnap = await db
      .collection("sessions")
      .orderBy("lastRunErrorAt", "desc")
      .select("lastRunErrorAt", "lastRunErrorMessage", "title", "userId", "status")
      .limit(limit + 1)
      .get();

    return res.json({
      logs,
      hasMore: logsSnap.size > limit || failedSnap.size > limit,
      failedSessions: failedSnap.docs.slice(0, limit).map((d) => ({
        ...serializeDoc(d),
        sessionId: d.id,
        message: d.data().lastRunErrorMessage,
        createdAt: d.data().lastRunErrorAt?.toDate?.()?.toISOString() ?? null,
        _type: "session_error",
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── Abuse Flags ───────────────────────────────────────────────────────────────

router.get("/admin/abuse-flags", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Feedback records are unavailable" });

  const limit = Math.max(1, Math.min(Math.floor(Number(req.query["limit"])) || 50, 200));

  try {
    // Filter before limiting: positive feedback must not crowd out flags.
    const snap = await db.collection("feedback")
      .where("rating", "in", ["bad", "warn"])
      .orderBy("createdAt", "desc").limit(limit + 1).get();
    const flagDocs = snap.docs.slice(0, limit);
    return res.json({
      flags: flagDocs.map(d => serializeDoc(d)),
      totalCount: flagDocs.length,
      hasMore: snap.size > limit,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});
export default router;
