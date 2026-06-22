/**
 * Brain route — POST /run-brain
 *
 * This file owns the credit lifecycle for every AI session:
 *
 *   1. Pre-run reservation  (reserveCredits)
 *      Estimates cost → atomically deducts from balance → writes a
 *      credit_transactions ledger entry (type="usage", source="brain_reservation").
 *      Rejected with HTTP 402 if balance is insufficient.
 *
 *   2. AI run  (runBrainSession from brainEngine.ts)
 *      Streams SSE to the client. Token counts are accumulated in the result.
 *
 *   3. Post-run settlement  (reconcileCredits)
 *      Calculates the ACTUAL cost from real token counts using the live
 *      Firestore multiplier (calculateLiveCredits from pricingConfig.ts).
 *      - actual < estimated → refund the difference (type="refund", source="brain_reconcile")
 *      - actual > estimated → charge the overage (a second reserveCredits call)
 *      - run failed         → full refund of the reservation (source="brain_failure_refund")
 *
 * ## Guest mode
 *   Requests without a Bearer token get one free session per server IP.
 *   Tracked in-memory (guestSessionIPs); resets on restart by design.
 *
 * ## Why reserveCredits / reconcileCredits are local functions
 *   They are intentionally NOT in creditLedger.ts because they are
 *   session-scoped (they carry a sessionId, use specific source labels,
 *   and are called on the hot path of the streaming response). Keeping
 *   them local avoids coupling the general ledger to brain-session details.
 *
 * See docs/credits.md §5 for the full lifecycle diagram.
 */
import { Router } from "express";
import crypto from "crypto";
import { runBrainSession, estimateCreditCost, type CourtConfig, type RebuttalContext } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { calculateActualCredits } from "../lib/creditEngine.js";
import { calculateLiveCredits } from "../lib/pricingConfig.js";
import { checkAndTriggerAutoRefill } from "../lib/creditLedger.js";
import { createPaymentLink, isSquareConfigured } from "../lib/squareClient.js";
import { findPackByPriceId } from "../lib/creditPacks.js";

const router = Router();

/**
 * Creates a Square Payment Link for an auto-refill top-up.
 * Used as the createCheckoutUrl callback passed to checkAndTriggerAutoRefill.
 */
async function createAutoRefillUrl(priceId: string, uid: string): Promise<string | null> {
  if (!isSquareConfigured()) return null;
  const found = findPackByPriceId(priceId);
  if (!found) return null;
  const { pack, price } = found;
  const creditAmount = parseInt(price.metadata.creditAmount, 10);
  const domain =
    process.env["APP_DOMAIN"] ??
    (process.env["REPLIT_DOMAINS"] as string | undefined)?.split(",")[0];
  if (!domain) return null;
  try {
    const link = await createPaymentLink({
      name: `${pack.name} — Auto-Refill`,
      amountCents: price.unit_amount,
      note: `LITIGANT:userId=${uid},creditAmount=${creditAmount},pack=${pack.id}`,
      redirectUrl: `https://${domain}/billing?success=true&refill=true`,
      idempotencyKey: crypto.randomUUID(),
    });
    return link.url;
  } catch {
    return null;
  }
}

/**
 * Guest session tracking — checks/writes Firestore `guest_sessions/{ip}` when
 * Firebase is configured (production). Falls back to an in-memory Set when
 * Firebase is not available (development / unit tests).
 *
 * Firestore document shape: { ip: string, usedAt: Timestamp }
 */
const _guestMemoryFallback = new Set<string>();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

async function hasGuestUsed(ip: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return _guestMemoryFallback.has(ip);
  try {
    const doc = await db.collection("guest_sessions").doc(ip.replace(/[./]/g, "_")).get();
    return doc.exists;
  } catch {
    return _guestMemoryFallback.has(ip);
  }
}

async function markGuestUsed(ip: string): Promise<void> {
  const db = getFirestoreDb();
  const safeKey = ip.replace(/[./]/g, "_");
  if (!db) {
    _guestMemoryFallback.add(ip);
    return;
  }
  try {
    await db.collection("guest_sessions").doc(safeKey).set({
      ip,
      usedAt: new Date(),
    });
  } catch {
    _guestMemoryFallback.add(ip);
  }
}

/**
 * Atomically reserves credits for an upcoming session.
 *
 * In a single Firestore transaction:
 *   - Reads the current balance.
 *   - Returns false (without writing anything) if balance < amount.
 *   - Otherwise deducts `amount` from the balance AND writes an immutable
 *     credit_transactions entry (type="usage", source="brain_reservation").
 *
 * Throwing vs returning false:
 *   - Returns false  → insufficient balance (caller sends HTTP 402).
 *   - Throws         → Firestore failure (caller sends HTTP 503).
 *
 * @param uid       - Firebase UID of the user.
 * @param amount    - Credits to reserve (from estimateSessionCredits).
 * @param sessionId - Used to link the ledger entry to the session document.
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
 * Atomically returns credits to a user's balance and writes a ledger entry.
 *
 * Used in two scenarios:
 *   "brain_reconcile"      — post-session, refund the difference between
 *                            the upfront estimate and the actual cost.
 *   "brain_failure_refund" — session failed before completing; refund the
 *                            full reservation so the user loses nothing.
 *
 * Errors are caught and logged but not re-thrown — the session result has
 * already been streamed to the client, so a reconcile failure is non-fatal.
 *
 * @param uid          - Firebase UID of the user.
 * @param refundAmount - Credits to return (always positive).
 * @param sessionId    - Links the ledger entry to the session document.
 * @param source       - Distinguishes reconcile vs failure refund in the ledger.
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
  const { question, config, templateId, sessionId: clientSessionId, continueFromTranscript, rebuttalContext, parentSessionId } = req.body as {
    question: string;
    config: CourtConfig;
    templateId?: string;
    sessionId?: string;
    continueFromTranscript?: string[];
    rebuttalContext?: RebuttalContext;
    parentSessionId?: string;
  };

  if (!question?.trim()) {
    res.status(400).json({ message: "question is required" });
    return;
  }

  // Mint the real session ID server-side before any credit movement so the
  // reservation, the run, and any failure-refund all reference the same ID.
  // Previously this fell through to `sessionId ?? "pending"` / `?? "failed"`
  // because the frontend never sends a sessionId on a new run — it only learns
  // the ID from the "start" SSE event, which fires after reservation. That
  // stamped every fresh reservation and failure-refund with the literal string
  // "pending" or "failed", breaking ledger auditability.
  // Resumed sessions still pass their existing sessionId from the client and
  // we honor it, since that ID was already generated server-side on the original run.
  const sessionId =
    clientSessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
      const reserved = await reserveCredits(uid, estimatedCost, sessionId);
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
    // Guest mode: one free session per IP, then require signup.
    // Mark BEFORE starting so concurrent requests from the same IP can't both slip through.
    const ip = getClientIp(req);
    if (await hasGuestUsed(ip)) {
      res.status(402).json({
        message:
          "Guest sessions are limited to one free trial. Create a free account to continue — you'll receive 100 credits.",
        guestLimitReached: true,
      });
      return;
    }
    await markGuestUsed(ip);
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

  // Hard 5-minute timeout — aborts if client stays connected but session hangs
  const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
  const sessionTimer = setTimeout(() => {
    console.warn("[brain] Session hard-timeout after 5 minutes — aborting.");
    abortCtrl.abort();
  }, SESSION_TIMEOUT_MS);

  let runSucceeded = false;
  let actualCost = 0;

  try {
    const result = await runBrainSession({
      question,
      config: effectiveConfig,
      templateId,
      sessionId,
      continueFromTranscript,
      rebuttalContext,
      res,
      abortSignal: abortCtrl.signal,
    });

    runSucceeded = true;
    actualCost = result.creditsUsed;

    // ── Post-run: reconcile credits + persist session ───────────────────────
    if (db && uid) {
      const sessionRef = db.collection("sessions").doc(result.sessionId);

      try {
        // Persist the session document (no credit mutations here — handled in reconcile step)
        await sessionRef.set({
          sessionId: result.sessionId,
          userId: uid,
          title: rebuttalContext
            ? `[Rebuttal ${rebuttalContext.rebuttalRound}] ${question.slice(0, 70)}`
            : question.slice(0, 80),
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
          conscienceVersion: result.conscienceVersion,
          shared: false,
          shareId: null,
          // Rebuttal metadata — present only on challenge runs
          ...(rebuttalContext ? {
            isRebuttal: true,
            rebuttalRound: rebuttalContext.rebuttalRound,
            rebuttalChallenge: rebuttalContext.challenge,
            parentSessionId: parentSessionId ?? null,
          } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

            // Settle with real token-based cost using live (Firestore-backed) multiplier
        actualCost = await calculateLiveCredits(
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

        // Auto-refill: check if user's balance has dropped below their threshold
        // and trigger a Square payment link if so (non-fatal)
        try {
          const userSnap = await db.collection("users").doc(uid).get();
          const newBalance = (userSnap.data()?.creditBalance as number) ?? 0;
          await checkAndTriggerAutoRefill(uid, newBalance, createAutoRefillUrl);
        } catch (e) {
          console.error("[brain] Auto-refill check failed (non-fatal):", e);
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
      await reconcileCredits(uid, estimatedCost, sessionId, "brain_failure_refund");
    }

    clearTimeout(sessionTimer);
    if (!res.writableEnded) res.end();
  }
});

export default router;
