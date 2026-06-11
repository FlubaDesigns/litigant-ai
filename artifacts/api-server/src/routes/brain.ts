import { Router } from "express";
import { runBrainSession, type CourtConfig } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

router.post("/run-brain", async (req, res) => {
  const { question, config, templateId, sessionId } = req.body as {
    question: string;
    config: CourtConfig;
    templateId?: string;
    sessionId?: string;
  };

  if (!question?.trim()) {
    res.status(400).json({ message: "question is required" });
    return;
  }

  // Auth (optional — guest sessions allowed)
  let uid: string | null = null;
  let creditBalance = 999;
  const authHeader = req.headers["authorization"];
  const db = getFirestoreDb();

  if (authHeader?.startsWith("Bearer ") && db) {
    const token = authHeader.slice(7);
    const decoded = await verifyIdToken(token);
    if (decoded) {
      uid = decoded.uid;
      try {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
          creditBalance = (userDoc.data()?.creditBalance as number) ?? 0;
        }
        if (creditBalance < 5) {
          res.status(402).json({ message: "Insufficient credits. Please top up your balance." });
          return;
        }
      } catch {
        // continue without credit check
      }
    }
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const result = await runBrainSession({
      question,
      config: config ?? {
        courtMode: "adversarial",
        litigantCount: 3,
        confidenceTarget: 80,
        maxIterations: 2,
        responseMode: "balanced",
        outputFormat: "report",
      },
      templateId,
      sessionId,
      res,
    });

    // Persist session + deduct credits when Firebase is configured
    if (db && uid) {
      try {
        const batch = db.batch();

        const sessRef = db.collection("sessions").doc(result.sessionId);
        batch.set(sessRef, {
          sessionId: result.sessionId,
          userId: uid,
          title: question.slice(0, 80),
          question,
          templateId: templateId ?? null,
          confidence: result.confidence,
          creditsUsed: result.creditsUsed,
          status: "complete",
          finalAnswer: result.finalAnswer,
          shared: false,
          shareId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const txRef = db.collection("credit_transactions").doc();
        const newBalance = Math.max(0, creditBalance - result.creditsUsed);
        batch.set(txRef, {
          transactionId: txRef.id,
          userId: uid,
          type: "usage",
          amount: -result.creditsUsed,
          balanceAfter: newBalance,
          source: "brain_session",
          sessionId: result.sessionId,
          createdAt: FieldValue.serverTimestamp(),
        });

        const userRef = db.collection("users").doc(uid);
        batch.update(userRef, { creditBalance: FieldValue.increment(-result.creditsUsed) });

        await batch.commit();
      } catch (e) {
        console.error("[brain] Firestore write failed:", e);
      }
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: "error", message: err?.message || "Internal error" })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

export default router;
