import { Router } from "express";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

router.get("/sessions", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];

  if (!db || !authHeader?.startsWith("Bearer ")) {
    res.json([]);
    return;
  }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = (req.query["cursor"] as string) || null;

  try {
    let query = db
      .collection("sessions")
      .where("userId", "==", decoded.uid)
      .orderBy("updatedAt", "desc")
      .limit(limit + 1);

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

router.get("/sessions/:id", async (req, res) => {
  const db = getFirestoreDb();
  if (!db) { res.status(404).json({ message: "Not found" }); return; }

  let uid: string | null = null;
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const decoded = await verifyIdToken(authHeader.slice(7));
    if (decoded) uid = decoded.uid;
  }

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists) { res.status(404).json({ message: "Session not found" }); return; }

    const data = doc.data()!;
    if (!data["shared"] && data["userId"] !== uid) {
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

router.patch("/sessions/:id", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];
  if (!db || !authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) { res.status(401).json({ message: "Unauthorized" }); return; }

  const { title, shared, starred, archived, shareId } = req.body as {
    title?: string;
    shared?: boolean;
    starred?: boolean;
    archived?: boolean;
    shareId?: string;
  };
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates["title"] = title;
  if (shared !== undefined) updates["shared"] = shared;
  if (starred !== undefined) updates["starred"] = starred;
  if (archived !== undefined) updates["archived"] = archived;
  if (shareId !== undefined) updates["shareId"] = shareId;

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists || doc.data()!["userId"] !== decoded.uid) { res.status(403).json({ message: "Forbidden" }); return; }
    await doc.ref.update(updates);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e?.message });
  }
});

export default router;
