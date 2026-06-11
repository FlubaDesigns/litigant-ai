import { Router } from "express";
import { runBrainSession, estimateCreditCost, type CourtConfig } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

// In-memory guest session tracking (resets on server restart)
// When Firebase is configured, use Firestore `guest_sessions` collection instead.
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

  // ── Auth + credit reservation ─────────────────────────────────────────────
  let uid: string | null = null;
  const authHeader = req.headers["authorization"];
  const db = getFirestoreDb();

  if (authHeader?.startsWith("Bearer ")) {
    // A bearer token was supplied — validate it strictly.
    // An invalid/expired token is always rejected; we do NOT fall through to guest mode.
    if (!db) {
      res.status(503).json({ message: "Auth service unavailable." });
      return;
    }
    const token = authHeader.slice(7);
    const decoded = await verifyIdToken(token);
    if (!decoded) {
      res.status(401).json({ message: "Invalid or expired auth token." });
      return;
    }
    uid = decoded.uid;

    // Optimistic credit reservation: deduct estimatedCost upfront atomically.
    // This prevents concurrent sessions from overdrawing the same balance.
    // Post-run: refund (estimatedCost - actualCost) when actual < estimated.
    let reserved = false;
    try {
      reserved = await db.runTransaction(async (txn) => {
        const userRef = db.collection("users").doc(uid!);
        const userDoc = await txn.get(userRef);
        const balance = (userDoc.data()?.creditBalance as number) ?? 0;
        if (balance < estimatedCost) return false;
        txn.update(userRef, { creditBalance: FieldValue.increment(-estimatedCost) });
        return true;
      });
    } catch {
      // Firestore unavailable — allow run without credit accounting
      reserved = true;
    }

    if (!reserved) {
      res.status(402).json({
        message: `Insufficient credits. This session requires approximately ${estimatedCost} credits.`,
      });
      return;
    }
  } else {
    // Guest mode: one free session per IP, then require signup
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

  // Wire client disconnect → abort signal so server-side AI calls stop immediately
  const abortCtrl = new AbortController();
  req.on("close", () => abortCtrl.abort());

  let runSucceeded = false;
  let actualCost = 0;

  try {
    const result = await runBrainSession({
      question,
      config: effectiveConfig,
      templateId,
      sessionId,
      res,
      abortSignal: abortCtrl.signal,
    });

    runSucceeded = true;
    actualCost = result.creditsUsed;

    // Mark guest IP as used after successful run
    if (!uid) {
      const ip = getClientIp(req);
      guestSessionIPs.add(ip);
    }

    // ── Post-run: reconcile credits + persist session ───────────────────────
    if (db && uid) {
      const sessionRef = db.collection("sessions").doc(result.sessionId);

      try {
        await db.runTransaction(async (txn) => {
          // Reconcile: if actual cost < reserved, refund the difference
          const refund = Math.max(0, estimatedCost - actualCost);
          if (refund > 0) {
            const userRef = db.collection("users").doc(uid!);
            txn.update(userRef, { creditBalance: FieldValue.increment(refund) });
          }

          // Persist session
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

          // Credit ledger entry (records the net cost)
          const txLedgerRef = db.collection("credit_transactions").doc();
          txn.set(txLedgerRef, {
            transactionId: txLedgerRef.id,
            userId: uid,
            type: "usage",
            amount: -actualCost,
            source: "brain_session",
            sessionId: result.sessionId,
            createdAt: FieldValue.serverTimestamp(),
          });
        });

        // Write session_turns subcollection (supplementary — outside transaction is fine)
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
        // Non-fatal — result already streamed; log for investigation
        console.error("[brain] Firestore post-run write failed:", e);
      }
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err?.message || "Internal error" })}\n\n`
      );
    }
  } finally {
    // If run failed and credits were reserved, refund the full reservation
    if (!runSucceeded && uid && db) {
      db.runTransaction(async (txn) => {
        const userRef = db.collection("users").doc(uid!);
        txn.update(userRef, { creditBalance: FieldValue.increment(estimatedCost) });
      }).catch((e) => console.error("[brain] Credit refund failed:", e));
    }

    if (!res.writableEnded) res.end();
  }
});

export default router;
