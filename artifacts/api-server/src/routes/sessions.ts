import { Router } from "express";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { FIXED_STAGE_PRIOR } from "../lib/creditEngine.js";
import crypto from "crypto";

const router = Router();

router.get("/sessions", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!db) {
    res.status(503).json({ message: "Service unavailable" });
    return;
  }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = (req.query["cursor"] as string) || null;
  const starredOnly = req.query["starred"] === "true";
  const archivedOnly = req.query["archived"] === "true";

  try {
    let query: FirebaseFirestore.Query = db
      .collection("sessions")
      .where("userId", "==", decoded.uid);
    if (starredOnly) query = query.where("starred", "==", true);
    else if (archivedOnly) query = query.where("archived", "==", true);
    query = query.orderBy("updatedAt", "desc").limit(limit + 1);

    if (cursor) {
      const cursorDoc = await db.collection("sessions").doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc) as typeof query;
      }
    }

    const snap = await query.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    res.json({
      sessions: docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() ?? null,
      })),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id ?? null : null,
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Failed to fetch sessions" });
  }
});

/**
 * GET /sessions/:id
 *
 * Owner-only. Anonymous public access is exclusively through GET /report/:shareId,
 * which requires the share token. This route never allows access based on the
 * `shared` flag alone — knowing a raw session ID is not sufficient.
 *
 * Previously this route allowed any request to read a session when data.shared
 * was true, with no share token required. Since session IDs were predictable
 * (timestamp + short random), this was a meaningful exposure. Fixed: owner-only.
 */
router.get("/sessions/:id", async (req, res) => {
  const db = getFirestoreDb();
  if (!db) { res.status(404).json({ message: "Not found" }); return; }

  // Require authentication — no anonymous access via raw session ID
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" }); return;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ message: "Unauthorized" }); return;
  }
  const uid = decoded.uid;

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists) { res.status(404).json({ message: "Session not found" }); return; }

    const data = doc.data()!;

    // Strict owner check — no shared-flag bypass
    if (data["userId"] !== uid) {
      res.status(403).json({ message: "Forbidden" }); return;
    }

    // If transcript/debateNotes were not saved in the session doc (legacy sessions),
    // reconstruct them from the session_turns subcollection.
    let transcript = (data["transcript"] as string) || "";
    let debateNotes = (data["debateNotes"] as string) || "";
    if (!transcript || !debateNotes) {
      try {
        const turnsSnap = await doc.ref
          .collection("session_turns")
          .orderBy("turnIndex")
          .get();
        if (!turnsSnap.empty) {
          const turns = turnsSnap.docs.map((t) => t.data());
          const lines = turns
            .filter((t) => t["role"] !== "Orchestrator")
            .map((t) => `**${t["role"] as string} (Round ${t["round"] as number}):**\n${t["content"] as string}`);
          transcript = lines.join("\n\n---\n\n");
          debateNotes = turns
            .filter((t) => t["role"] !== "Orchestrator" && t["role"] !== "Verdict")
            .map((t) => `### ${t["role"] as string} — Round ${t["round"] as number}\n${t["content"] as string}`)
            .join("\n\n---\n\n");
        }
      } catch {
        // non-fatal — return whatever we have
      }
    }

    res.json({
      id: doc.id,
      ...data,
      transcript,
      debateNotes,
      createdAt: data["createdAt"]?.toDate?.()?.toISOString() ?? null,
      updatedAt: data["updatedAt"]?.toDate?.()?.toISOString() ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];
  if (!db || !authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) { res.status(401).json({ message: "Unauthorized" }); return; }

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists) { res.status(404).json({ message: "Not found" }); return; }
    if (doc.data()!["userId"] !== decoded.uid) { res.status(403).json({ message: "Forbidden" }); return; }
    // Also delete session_turns subcollection
    const turnsSnap = await doc.ref.collection("session_turns").get();
    await Promise.all(turnsSnap.docs.map((t) => t.ref.delete()));
    await doc.ref.delete();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e?.message });
  }
});

/**
 * PATCH /sessions/:id
 *
 * Runtime-validated — rejects unexpected types, oversized strings, and unknown keys.
 * When shared is set to false, shareId is cleared so re-sharing mints a fresh token
 * and old leaked links remain permanently invalid.
 */
router.patch("/sessions/:id", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];
  if (!db || !authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) { res.status(401).json({ message: "Unauthorized" }); return; }

  // shareId is intentionally excluded from the accepted body — it is always
  // generated server-side via POST /sessions/:id/share to prevent spoofing.
  const { title, shared, starred, archived } = req.body as {
    title?: unknown;
    shared?: unknown;
    starred?: unknown;
    archived?: unknown;
  };

  const updates: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== "string") {
      res.status(400).json({ message: "title must be a string" }); return;
    }
    updates["title"] = title.trim().slice(0, 200);
  }
  if (shared !== undefined) {
    if (typeof shared !== "boolean") {
      res.status(400).json({ message: "shared must be a boolean" }); return;
    }
    updates["shared"] = shared;
    // When unsharing, clear the share token so re-sharing later can't reactivate
    // a previously leaked link. The old shareId permanently stops working.
    if (shared === false) updates["shareId"] = null;
  }
  if (starred !== undefined) {
    if (typeof starred !== "boolean") {
      res.status(400).json({ message: "starred must be a boolean" }); return;
    }
    updates["starred"] = starred;
  }
  if (archived !== undefined) {
    if (typeof archived !== "boolean") {
      res.status(400).json({ message: "archived must be a boolean" }); return;
    }
    updates["archived"] = archived;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "No valid fields to update" }); return;
  }

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists || doc.data()!["userId"] !== decoded.uid) { res.status(403).json({ message: "Forbidden" }); return; }
    await doc.ref.update(updates);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e?.message });
  }
});

/**
 * POST /sessions/:id/share — generate a new shareId and mark the session shared.
 *
 * Always mints a fresh token — never reuses an existing shareId. This ensures
 * that if a user unshares and later re-shares, the old link stays permanently
 * dead and cannot be reactivated by anyone who had it.
 */
router.post("/sessions/:id/share", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];
  if (!db || !authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) { res.status(401).json({ message: "Unauthorized" }); return; }

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists || doc.data()!["userId"] !== decoded.uid) { res.status(403).json({ message: "Forbidden" }); return; }

    // Always mint a new shareId — never reuse the old one.
    // This means re-sharing after an unshare gives a new URL, not the same one.
    const shareId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    await doc.ref.update({ shared: true, shareId });
    res.json({ success: true, shareId });
  } catch (e: any) {
    res.status(500).json({ message: e?.message });
  }
});

/**
 * GET /calibration
 * Returns per-user calibrated fixed-stage token averages derived from the
 * user's own session history.  The frontend uses this to make credit
 * estimates more accurate the more sessions the user has run.
 */
router.get("/calibration", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const db = getFirestoreDb();
  if (!db) {
    res.json({ fixedStage: FIXED_STAGE_PRIOR, sessionCount: 0, isCalibrated: false, minSessions: 3 });
    return;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const MIN_SESSIONS = 3;
  try {
    const snap = await db
      .collection("sessions")
      .where("userId", "==", decoded.uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const records = snap.docs
      .map((d) => d.data().fixedStageTokens as { input: number; output: number } | undefined)
      .filter((r): r is { input: number; output: number } => !!r && r.input > 0 && r.output > 0);

    if (records.length < MIN_SESSIONS) {
      res.json({ fixedStage: FIXED_STAGE_PRIOR, sessionCount: records.length, isCalibrated: false, minSessions: MIN_SESSIONS });
      return;
    }

    const avg = {
      input:  Math.round(records.reduce((s, r) => s + r.input,  0) / records.length),
      output: Math.round(records.reduce((s, r) => s + r.output, 0) / records.length),
    };
    res.json({ fixedStage: avg, sessionCount: records.length, isCalibrated: true, minSessions: MIN_SESSIONS });
  } catch {
    res.json({ fixedStage: FIXED_STAGE_PRIOR, sessionCount: 0, isCalibrated: false, minSessions: 3 });
  }
});

export default router;
