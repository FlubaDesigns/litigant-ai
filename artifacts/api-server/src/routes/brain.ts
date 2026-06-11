import { Router } from "express";
import { runBrainSession, estimateCreditCost, type CourtConfig } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

// In-memory guest session tracking (resets on server restart; replace with Firestore when Firebase configured)
const guestSessionIPs = new Set<string>();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

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

  const effectiveConfig: CourtConfig = config ?? {
    courtMode: "adversarial",
    litigantCount: 3,
    confidenceTarget: 80,
    maxIterations: 2,
    responseMode: "balanced",
    outputFormat: "report",
  };

  const estimatedCost = estimateCreditCost(effectiveConfig);

  // ── Auth + credit enforcement ──────────────────────────────────────────────
  let uid: string | null = null;
  const authHeader = req.headers["authorization"];
  const db = getFirestoreDb();

  if (authHeader?.startsWith("Bearer ") && db) {
    const token = authHeader.slice(7);
    const decoded = await verifyIdToken(token);
    if (decoded) {
      uid = decoded.uid;
      // Atomic pre-run credit check via transaction
      try {
        const creditOk = await db.runTransaction(async (txn) => {
          const userRef = db.collection("users").doc(uid!);
          const userDoc = await txn.get(userRef);
          const balance = (userDoc.data()?.creditBalance as number) ?? 0;
          if (balance < estimatedCost) return false;
          // Reserve credits optimistically; finalise actual deduction after run
          return true;
        });
        if (!creditOk) {
          res.status(402).json({
            message: `Insufficient credits. This session requires approximately ${estimatedCost} credits.`,
          });
          return;
        }
      } catch {
        // Non-fatal — allow run, skip deduction if Firestore unavailable
      }
    }
  } else {
    // Guest session: allow one free session per IP, then prompt signup
    const ip = getClientIp(req);
    if (guestSessionIPs.has(ip)) {
      res.status(402).json({
        message:
          "Guest sessions are limited to one free trial. Create a free account to continue — you'll receive 50 credits.",
        guestLimitReached: true,
      });
      return;
    }
  }

  // ── SSE headers ────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const result = await runBrainSession({
      question,
      config: effectiveConfig,
      templateId,
      sessionId,
      res,
    });

    // Mark guest IP as used
    if (!uid) {
      const ip = getClientIp(req);
      guestSessionIPs.add(ip);
    }

    // ── Persist + deduct credits atomically ────────────────────────────────
    if (db && uid) {
      try {
        const sessionRef = db.collection("sessions").doc(result.sessionId);

        // Atomic credit deduction + session write
        await db.runTransaction(async (txn) => {
          const userRef = db.collection("users").doc(uid!);
          const userDoc = await txn.get(userRef);
          const currentBalance = (userDoc.data()?.creditBalance as number) ?? 0;
          const actualCost = Math.min(result.creditsUsed, currentBalance);
          const newBalance = Math.max(0, currentBalance - actualCost);

          // Deduct credits
          txn.update(userRef, { creditBalance: newBalance });

          // Write session document
          txn.set(sessionRef, {
            sessionId: result.sessionId,
            userId: uid,
            title: question.slice(0, 80),
            question,
            templateId: templateId ?? null,
            confidence: result.confidence,
            creditsUsed: actualCost,
            status: "complete",
            finalAnswer: result.finalAnswer,
            artifacts: result.artifacts,
            shared: false,
            shareId: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Write credit transaction ledger entry
          const txLedgerRef = db.collection("credit_transactions").doc();
          txn.set(txLedgerRef, {
            transactionId: txLedgerRef.id,
            userId: uid,
            type: "usage",
            amount: -actualCost,
            balanceAfter: newBalance,
            source: "brain_session",
            sessionId: result.sessionId,
            createdAt: FieldValue.serverTimestamp(),
          });
        });

        // Write session_turns subcollection (outside transaction — supplementary, not critical)
        const turnsCol = sessionRef.collection("session_turns");
        await Promise.all(
          result.turns.map((turn, idx) =>
            turnsCol.doc(`turn_${String(idx).padStart(3, "0")}`).set({
              turnIndex: idx,
              role: turn.role,
              round: turn.round,
              content: turn.content,
              createdAt: FieldValue.serverTimestamp(),
            })
          )
        );
      } catch (e) {
        // Non-fatal — session result already streamed to client
        console.error("[brain] Firestore write failed:", e);
      }
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err?.message || "Internal error" })}\n\n`
      );
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

export default router;
