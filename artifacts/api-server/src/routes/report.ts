import { Router } from "express";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

/**
 * GET /report/:shareId
 * Public endpoint — no auth required.
 * Returns a shared session report if sessions.shared === true and shareId matches.
 */
router.get("/report/:shareId", async (req, res) => {
  const db = getFirestoreDb();
  if (!db) {
    return res.status(404).json({ error: "not_found" });
  }

  const { shareId } = req.params as { shareId: string };

  try {
    const snap = await db
      .collection("sessions")
      .where("shareId", "==", shareId)
      .where("shared", "==", true)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: "not_found" });
    }

    const doc = snap.docs[0]!;
    const data = doc.data();

    // Only expose fields suitable for public consumption
    const publicFields = [
      "sessionId", "title", "question", "templateId",
      "confidence", "creditsUsed", "status",
      "finalAnswer", "debateNotes", "transcript", "caveats", "artifacts",
      "shared", "shareId",
    ];

    const result: Record<string, unknown> = { id: doc.id };
    for (const field of publicFields) {
      if (data[field] !== undefined) result[field] = data[field];
    }

    // Serialize timestamps
    if (data["createdAt"]?.toDate) result["createdAt"] = data["createdAt"].toDate().toISOString();
    if (data["updatedAt"]?.toDate) result["updatedAt"] = data["updatedAt"].toDate().toISOString();

    // Always fetch session_turns to compute accurate metrics and fill missing inline fields
    try {
      const turnsSnap = await doc.ref
        .collection("session_turns")
        .orderBy("turnIndex")
        .get();
      if (!turnsSnap.empty) {
        const turns = turnsSnap.docs.map((t) => t.data());
        if (!result["transcript"]) {
          result["transcript"] = turns
            .filter((t) => t["role"] !== "Orchestrator")
            .map((t) => `**${t["role"]} (Round ${t["round"]}):**\n${t["content"]}`)
            .join("\n\n---\n\n");
        }
        if (!result["debateNotes"]) {
          result["debateNotes"] = turns
            .filter((t) => t["role"] !== "Orchestrator" && t["role"] !== "Verdict")
            .map((t) => `### ${t["role"]} — Round ${t["round"]}\n${t["content"]}`)
            .join("\n\n---\n\n");
        }
        // Always derive metrics from turns — do not rely on inline session fields.
        //
        // NON_LITIGANT_ROLES: every role brainEngine.ts writes that is NOT a
        // real debate participant. Must be kept in sync with turns.push() calls
        // in brainEngine.ts. Current pipeline roles and their round sentinels:
        //   Orchestrator  round: 0   (opening frame)
        //   Moderator     round: 99  (post-debate summary)
        //   Architect     round: 99  (artifact blueprint)
        //   Builder       round: 99  (initial build + any retry revision passes)
        //   Auditor       round: 99  (initial review + any retry re-review passes)
        //   Verdict       round: 99  (final verdict)
        // All others are actual litigants carrying real round numbers (1, 2, 3…).
        // Multiple Builder/Auditor turns appear when the Auditor retry loop fires.
        const NON_LITIGANT_ROLES = new Set([
          "Orchestrator", "Moderator", "Architect", "Builder", "Auditor", "Verdict",
        ]);
        const debateTurns = turns.filter((t: any) => !NON_LITIGANT_ROLES.has(t["role"]));
        const rounds   = debateTurns.reduce((max: number, t: any) => Math.max(max, t["round"] ?? 0), 0);
        const litigants = new Set(debateTurns.map((t: any) => t["role"])).size;
        result["roundsCompleted"] = rounds;
        result["litigantCount"] = litigants;
      }
    } catch {
      // Non-fatal — report still renders without turn-derived metrics
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
