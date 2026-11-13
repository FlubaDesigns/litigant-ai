import { SatisfactionSubmissionSchema, SatisfactionRatingsSchema } from "@workspace/api-zod/satisfaction";
import { satisfactionId } from "../lib/satisfaction.js";
import { Router } from "express";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { getAdminLimits } from "../lib/adminLimitsConfig.js";
import { makeRateLimiter } from "../lib/rateLimiter.js";

const router = Router();
const identifier = z.string().min(1).max(200).regex(/^[^/]+$/);
const Feedback = z.object({
  userId: identifier.nullable().optional(),
  sessionId: identifier.nullable(), turnId: identifier,
  role: z.string().min(1).max(100), rating: z.enum(["good", "bad", "warn"]),
  reason: z.string().max(500).optional(), notes: z.string().max(2000).optional(),
}).strict();

router.post("/feedback", async (req, res, next) => {
  const header = req.headers.authorization;
  const user = header?.startsWith("Bearer ") ? await verifyIdToken(header.slice(7)) : null;
  if (!user) return res.status(401).json({error: "Sign in before submitting feedback."});
  const parsed = z.union([SatisfactionSubmissionSchema, Feedback]).safeParse(req.body);
  if (!parsed.success || (parsed.data.userId && parsed.data.userId !== user.uid)) {
    return res.status(400).json({error: "Invalid feedback."});
  }
  res.locals.feedback = {...parsed.data, userId: user.uid};
  try {
    const limits = await getAdminLimits();
    await makeRateLimiter({keyFn: () => `feedback:${user.uid}`, limit: limits.feedbackPerHour,
      windowMs: 3600000, message: "Too much feedback submitted. Please try again later."})(req, res, next);
  } catch { res.status(503).json({error: "Feedback is temporarily unavailable."}); }
  return;
}, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Feedback is temporarily unavailable."});
  const feedback = res.locals.feedback;
  try {
    if (feedback.kind === "satisfaction") {
      const ref = db.collection("feedback").doc(satisfactionId(feedback.userId,feedback.sessionId));
      const status = await db.runTransaction(async tx => {
        const session = (await tx.get(db.collection("sessions").doc(feedback.sessionId))).data();
        const fence = await tx.get(db.collection("account_deletions").doc(feedback.userId));
        const existing = await tx.get(ref);
        if (!session || session.userId !== feedback.userId) return 403;
        if (session.status !== "complete" || fence.exists) return 409;
        tx.set(ref,{...feedback,createdAt:existing.data()?.createdAt ?? FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
        return 200;
      });
      if (status !== 200) return res.status(status).json({error:status===403 ? "Session access denied." : "This session cannot be rated right now."});
      return res.json({saved:true});
    }
    // In-progress/free conversations may not have a stored session yet.
    if (feedback.sessionId) {
      const session = (await db.collection("sessions").doc(feedback.sessionId).get()).data();
      if (session && session.userId !== feedback.userId) return res.status(403).json({error: "Session access denied."});
    }
    await db.collection("feedback").add({...feedback, createdAt: FieldValue.serverTimestamp()});
    return res.status(201).json({saved: true});
  } catch { return res.status(503).json({error: "Feedback could not be saved. Please try again."}); }
});
router.get("/feedback/satisfaction/:sessionId", async (req,res) => {
  const header=req.headers.authorization;
  const user=header?.startsWith("Bearer ") ? await verifyIdToken(header.slice(7)) : null;
  if (!user) return res.status(401).json({error:"Sign in before viewing feedback."});
  const parsed=identifier.safeParse(req.params["sessionId"]);
  if (!parsed.success) return res.status(400).json({error:"Invalid session."});
  const db=getFirestoreDb();
  if (!db) return res.status(503).json({error:"Feedback is temporarily unavailable."});
  try {
    const session=(await db.collection("sessions").doc(parsed.data).get()).data();
    if (!session || session.userId!==user.uid) return res.status(403).json({error:"Session access denied."});
    const saved=(await db.collection("feedback").doc(satisfactionId(user.uid,parsed.data)).get()).data();
    const ratings=saved ? SatisfactionRatingsSchema.parse({answered:saved.answered,satisfied:saved.satisfied,reuse:saved.reuse}) : null;
    return res.json({ratings});
  } catch { return res.status(503).json({error:"Feedback could not be loaded. Please try again."}); }
});
export default router;
