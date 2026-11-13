import { projectSessionContent, sessionTurnMetrics } from "../lib/sessionContent.js";
import { CourtConfigSchema } from "@workspace/api-zod/session";
import { Router } from "express";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";
import { safeError } from "../lib/safeError.js";

import { invitationActive } from "../lib/guestInvitations.js";

import { makeRateLimiter } from "../lib/rateLimiter.js";
const router = Router();
const reportLimiter = makeRateLimiter({keyFn: req => `report:${req.ip ?? "unknown"}`,
  limit: 120, windowMs: 60_000, message: "Too many report requests. Please try again shortly."});

/**
 * GET /report/:shareId
 * Public endpoint — no auth required.
 * Returns a shared session report if sessions.shared === true and shareId matches.
 */
router.get("/report/:shareId", reportLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
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

    if (data.userId) {
      const profile = (await db.collection("users").doc(data.userId).get()).data();
      if (profile?.guestInvitationId) {
        const invitation = (await db.collection("guest_invitations").doc(profile.guestInvitationId).get()).data();
        if (!invitationActive(invitation)) return res.status(404).json({error: "not_found"});
      }
    }
    // Only expose fields suitable for public consumption
    const publicFields = [
      "sessionId", "title", "question", "templateId",
      "confidence", "creditsUsed", "status",
      "finalAnswer", "debateNotes", "transcript", "caveats", "artifacts",
      "shared", "shareId", "courtroomOutcome", "acceptedAt", "outputIncomplete",
    ];

    const parsedConfig = CourtConfigSchema.safeParse(data.config ?? {});
    const result: Record<string, unknown> = { id: doc.id, outputStrategy: parsedConfig.success ? parsedConfig.data.outputStrategy : "moderator-consensus" };
    for (const field of publicFields) {
      if (data[field] !== undefined) result[field] = data[field];
    }

    // Serialize timestamps
    if (data["createdAt"]?.toDate) result["createdAt"] = data["createdAt"].toDate().toISOString();
    if (data["updatedAt"]?.toDate) result["updatedAt"] = data["updatedAt"].toDate().toISOString();

    // Current sessions persist metrics; legacy records alone need turn reconstruction.
    result["roundsCompleted"] = data.roundsCompleted;
    result["litigantCount"] = data.litigantCount;
    if (!result.transcript || !result.debateNotes || data.roundsCompleted === undefined || data.litigantCount === undefined) try {
      const turnsSnap = await doc.ref
        .collection("session_turns")
        .orderBy("turnIndex")
        .get();
      if (!turnsSnap.empty) {
        const turns = turnsSnap.docs.map((t) => t.data());
        Object.assign(result, projectSessionContent(data, turns), sessionTurnMetrics(turns));
      }
    } catch {
      // Non-fatal — report still renders without turn-derived metrics
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

export default router;
