import { readSessionTurns } from "../../lib/sessionContent.js";
import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { safeError } from "../../lib/safeError.js";
import { requireAdmin, serializeDoc } from "./shared.js";

const router = Router();


// ── Sessions ──────────────────────────────────────────────────────────────────

router.get("/admin/sessions", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Session service unavailable"});

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
      sessions: docs.map((d: any) => serializeDoc(d, true)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.get("/admin/sessions/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(404).json({ error: "Not found" });

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists) return res.status(404).json({ error: "Session not found" });

    const data = serializeDoc(doc, true);
    const turns = (readSessionTurns(doc.data()!)).map(turn => ({...turn, createdAt: turn.createdAt && typeof turn.createdAt === "object" && "toDate" in turn.createdAt && typeof turn.createdAt.toDate === "function" ? turn.createdAt.toDate().toISOString() : turn.createdAt}));

    return res.json({ session: data, turns });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});
export default router;
