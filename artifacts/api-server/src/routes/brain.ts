import { Router } from "express";
import { runBrainSession, estimateCreditCost, type CourtConfig } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { calculateActualCredits } from "../lib/creditEngine.js";

const router = Router();

// In-memory guest session tracking (resets on server restart)
// When Firebase is configured, use Firestore `guest_sessions` collection instead.
const guestSessionIPs = new Set<string>();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Atomically reserve credits by writing both the balance deduction AND the
 * ledger entry in a single Firestore transaction.
 *
 * Returns `true` if reservation succeeded, `false` if insufficient balance.
 * Throws if the transaction itself fails.
 */
async function reserveCredits(
  uid: string,
  amount: number,
  sessionId: string
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore not configured");

  return db.runTransaction(async (txn) => {
    const userRef = db.collection("users").doc(uid);
    const userDoc = await txn.get(userRef);
    const balance = (userDoc.data()?.creditBalance as number) ?? 0;
    if (balance < amount) return false;

    const newBalance = balance - amount;

    // Update balance
    txn.update(userRef, { creditBalance: newBalance, updatedAt: FieldValue.serverTimestamp() });

    // Immutable ledger entry for the reservation
    const txRef = db.collection("credit_transactions").doc();
    txn.set(txRef, {
      userId: uid,
      type: "usage",
      amount: -amount,
      balanceAfter: newBalance,
      source: "brain_reservation",
      sessionId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
}

/**
 * Write a reconciliation ledger entry + update balance atomically.
 * Used for both over-estimate refunds and full failure refunds.
 */
async function reconcileCredits(
  uid: string,
  refundAmount: number,
  sessionId: string,
  source: "brain_reconcile" | "brain_failure_refund"
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db.runTransaction(async (txn) => {
    const userRef = db.collection("users").doc(uid);
    const userDoc = await txn.get(userRef);
    const balance = (userDoc.data()?.creditBalance as number) ?? 0;
    const newBalance = balance + refundAmount;

    txn.update(userRef, { creditBalance: newBalance, updatedAt: FieldValue.serverTimestamp() });

    // Immutable ledger entry for the refund
    const txRef = db.collection("credit_transactions").doc();
    txn.set(txRef, {
      userId: uid,
      type: "refund",
      amount: refundAmount,
      balanceAfter: newBalance,
      source,
      sessionId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }).catch((e) => console.error(`[brain] ${source} failed for ${uid}:`, e));
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
    if (!db || !isFirebaseConfigured()) {
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

    // Optimistic credit reservation: deduct estimatedCost upfront.
    // Every balance change (reservation, refund, failure refund) is ledgered atomically.
    try {
      const reserved = await reserveCredits(uid, estimatedCost, sessionId ?? "pending");
      if (!reserved) {
        res.status(402).json({
          message: `Insufficient credits. This session requires approximately ${estimatedCost} credits.`,
        });
        return;
      }
    } catch (err) {
      console.error("[brain] Credit reservation failed:", err);
      res.status(503).json({ message: "Credit service temporarily unavailable. Please try again." });
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
        // Persist the session document (no credit mutations here — handled in reconcile step)
        await sessionRef.set({
          sessionId: result.sessionId,
          userId: uid,
          title: question.slice(0, 80),
          question,
          templateId: templateId ?? null,
          confidence: result.confidence,
          creditsUsed: actualCost,
          status: "complete",
          finalAnswer: result.finalAnswer,
          debateNotes: result.debateNotes,
          transcript: result.debateNotes ? result.transcript.join("\n\n---\n\n") : "",
          caveats: result.caveats,
          artifacts: result.artifacts,
          shared: false,
          shareId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

            // Settle with real token-based cost
        actualCost = calculateActualCredits(
          result.model || "gpt-4o",
          result.tokenUsage.inputTokens,
          result.tokenUsage.outputTokens
        );

        // Reconcile: if actual < estimated, refund the difference
        const refund = Math.max(0, estimatedCost - actualCost);
        if (refund > 0) {
          await reconcileCredits(uid, refund, result.sessionId, "brain_reconcile");
        }
        // If actual > estimated (rare edge case), charge the overage
        if (actualCost > estimatedCost && uid) {
          const overage = actualCost - estimatedCost;
          await reserveCredits(uid, overage, result.sessionId).catch(() => {/* non-fatal */});
        }

        // Write session_turns subcollection
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
    // If run failed and credits were reserved, refund the full reservation as a ledger entry
    if (!runSucceeded && uid && db) {
      await reconcileCredits(uid, estimatedCost, sessionId ?? "failed", "brain_failure_refund");
    }

    if (!res.writableEnded) res.end();
  }
});

export default router;
