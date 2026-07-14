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
import { runBrainSession, type CourtConfig, type RebuttalContext } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { calculateActualCredits, estimateSessionCreditsCalibrated, estimateFixedPipelineCost, getModelRate } from "../lib/creditEngine.js";
import { calculateLiveCredits } from "../lib/pricingConfig.js";
import { checkAndTriggerAutoRefill } from "../lib/creditLedger.js";
import { getBillingDefaults } from "../lib/billingDefaultsConfig.js";
import { sendLowCreditsEmail, sendSessionCompleteEmail, isResendConfigured } from "../lib/emailService.js";
import { createPaymentLink, isSquareConfigured } from "../lib/squareClient.js";

const router = Router();

/**
 * Creates a Square Payment Link for an auto-refill top-up.
 * Used as the createCheckoutUrl callback passed to checkAndTriggerAutoRefill.
 */
async function createAutoRefillUrl(dollarAmount: number, uid: string): Promise<string | null> {
  if (!isSquareConfigured()) return null;
  const dollars = Math.max(1, Math.round(dollarAmount));
  const amountCents = dollars * 100;
  const creditAmount = dollars * 100; // 100 credits per dollar
  const domain =
    process.env["APP_DOMAIN"] ??
    (process.env["REPLIT_DOMAINS"] as string | undefined)?.split(",")[0];
  if (!domain) return null;
  try {
    const link = await createPaymentLink({
      name: `Credit Top-Up — $${dollars}`,
      amountCents,
      note: `LITIGANT:userId=${uid},creditAmount=${creditAmount},type=auto_refill`,
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
  // req.ip is trust-proxy-aware (app-firebase.ts sets "trust proxy", 1).
  // Using req.ip is consistent with how auth.ts rate-limiters key on client IP
  // and is NOT spoofable via a crafted X-Forwarded-For header.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
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
  sessionId: string,
  source = "brain_reservation",
  overdraftLimit = 0
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore not configured");

  return db.runTransaction(async (txn) => {
    const userRef = db.collection("users").doc(uid);
    const userDoc = await txn.get(userRef);
    const balance = (userDoc.data()?.creditBalance as number) ?? 0;
    if (balance - amount < -overdraftLimit) return false;

    const newBalance = balance - amount;

    // Update balance
    txn.update(userRef, { creditBalance: newBalance, updatedAt: FieldValue.serverTimestamp() });

    // Immutable ledger entry — source distinguishes initial reservations from overage charges
    const txRef = db.collection("credit_transactions").doc();
    txn.set(txRef, {
      userId: uid,
      type: "usage",
      amount: -amount,
      balanceAfter: newBalance,
      source,
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
  const { question, config, templateId, sessionId: clientSessionId, continueFromTranscript, rebuttalContext, parentSessionId, caseFile, resumeWithFixedPipeline } = req.body as {
    question: string;
    config: CourtConfig;
    templateId?: string;
    sessionId?: string;
    continueFromTranscript?: string[];
    rebuttalContext?: RebuttalContext;
    parentSessionId?: string;
    caseFile?: { id: string; type: "url" | "file"; name: string; content: string; url?: string }[];
    resumeWithFixedPipeline?: boolean;
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

  const effectiveConfig: CourtConfig = {
    ...config,
    litigantCount: config.litigantCount ?? 3,
    confidenceTarget: config.confidenceTarget ?? 80,
    maxIterations: config.maxIterations ?? 2,
    responseMode: config.responseMode ?? "balanced",
    outputFormat: config.outputFormat ?? "report",
  };

  // Enforce the admin-configured max litigant count before cost estimation so
  // the credit reservation is never based on a higher count than will actually
  // run. Non-fatal — if Firestore is unavailable we proceed with the client's
  // requested count (fail-open, not fail-closed).
  {
    const limitDb = getFirestoreDb();
    if (limitDb) {
      try {
        const limitsDoc = await limitDb.collection("config").doc("adminLimits").get();
        if (limitsDoc.exists) {
          const maxLitigants = (limitsDoc.data()?.["maxLitigants"] as number) ?? 10;
          effectiveConfig.litigantCount = Math.min(effectiveConfig.litigantCount, maxLitigants);
        }
      } catch { /* non-fatal */ }
    }
  }

  // Pipeline-only resumes cost much less — use the fixed-stage estimate so we
  // don't over-reserve (and then partially refund) on every cap-raise continue.
  const estimatedCost = resumeWithFixedPipeline
    ? estimateFixedPipelineCost(effectiveConfig.model)
    : await estimateSessionCreditsCalibrated(effectiveConfig);

  // ── Auth + credit reservation ─────────────────────────────────────────────
  let uid: string | null = null;
  let isAdminRun = false;
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
    isAdminRun = decoded.admin === true;

    if (!isAdminRun) {
      // Resolve overdraft limit if user opted in
      let overdraftLimit = 0;
      const overdraftRequested = (req.body as any).overdraft === true;
      if (overdraftRequested && db) {
        try {
          const [flagDoc, limitDoc] = await Promise.all([
            db.collection("config").doc("featureFlags").get(),
            db.collection("config").doc("adminLimits").get(),
          ]);
          const overdraftEnabled = flagDoc.exists ? (flagDoc.data()?.["creditOverdraft"] === true) : false;
          if (overdraftEnabled) {
            overdraftLimit = limitDoc.exists ? ((limitDoc.data()?.["overdraftLimit"] as number) ?? 500) : 500;
          }
        } catch { /* non-fatal — no overdraft */ }
      }

      // Optimistic credit reservation: deduct estimatedCost upfront.
      // Every balance change (reservation, refund, failure refund) is ledgered atomically.
      try {
        const reserved = await reserveCredits(uid, estimatedCost, sessionId, "brain_reservation", overdraftLimit);
        if (!reserved) {
          res.status(402).json({
            message: `Insufficient credits. This session requires approximately ${estimatedCost} credits.`,
            overdraftLimit,
          });
          return;
        }
      } catch (err) {
        console.error("[brain] Credit reservation failed:", err);
        res.status(503).json({ message: "Credit service temporarily unavailable. Please try again." });
        return;
      }
    }
  } else {
    // Guest mode: one free session per IP, then require signup.
    // Mark BEFORE starting so concurrent requests from the same IP can't both slip through.
    const ip = getClientIp(req);
    if (await hasGuestUsed(ip)) {
      const { signupBonusCredits } = await getBillingDefaults();
      res.status(402).json({
        message:
          `Guest sessions are limited to one free trial. Create a free account to continue — you'll receive ${signupBonusCredits ?? 500} credits.`,
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

  // Hard 10-minute timeout — aborts if client stays connected but session hangs
  const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
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
      caseFile,
      resumeWithFixedPipeline,
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
          confidence: Number.isNaN(result.confidence) ? 0 : result.confidence,
          creditsUsed: actualCost,
          fixedStageTokens: result.fixedStageTokens,
          status: result.pausedPrePipeline ? "paused_pre_pipeline" : "complete",
          finalAnswer: result.finalAnswer,
          debateNotes: result.debateNotes,
          transcript: result.debateNotes
            ? (Array.isArray(result.transcript)
                ? result.transcript.join("\n\n---\n\n")
                : (result.transcript ?? ""))
            : "",
          caveats: result.caveats,
          artifacts: result.artifacts,
          conscienceVersion: result.conscienceVersion,
          starred: false,
          archived: false,
          shared: false,
          shareId: null,
          // Case file metadata — names + urls only (content not stored in Firestore)
          ...(caseFile && caseFile.length > 0 ? {
            caseFileMeta: caseFile.map(({ id, type, name, url }) => ({ id, type, name, url: url ?? null })),
          } : {}),
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
        if (!isAdminRun) {
          actualCost = await calculateLiveCredits(
            result.model || "gpt-5",
            result.tokenUsage.inputTokens,
            result.tokenUsage.outputTokens
          );

          // Reconcile: if actual < estimated, refund the difference
          const refund = Math.max(0, estimatedCost - actualCost);
          if (refund > 0) {
            await reconcileCredits(uid, refund, result.sessionId, "brain_reconcile");
          }
        }
        // If actual > estimated, charge the overage.
        // This path is not a rare edge case — the pre-run estimate converges to real cost
        // over time via calibration (see creditEngine.ts) but a gap can remain.
        if (!isAdminRun && actualCost > estimatedCost && uid) {
          const overage = actualCost - estimatedCost;
          const overageCollected = await reserveCredits(uid, overage, result.sessionId, "brain_overage")
            .catch(() => false);
          if (!overageCollected) {
            // Balance was insufficient — session already delivered, overage uncollectable.
            // Log a warning and write a zero-debit ledger entry so the shortfall is visible
            // in the audit trail rather than silently vanishing.
            console.warn(
              `[brain] overage uncollected uid=${uid} sessionId=${result.sessionId} overage=${overage}`
            );
            if (db) {
              db.collection("credit_transactions").add({
                userId: uid,
                type: "usage_shortfall",
                amount: 0,
                balanceAfter: null,
                source: "brain_overage_uncollected",
                sessionId: result.sessionId,
                overage,
                createdAt: FieldValue.serverTimestamp(),
              }).catch((e) => console.error("[brain] failed to record overage shortfall:", e));
            }
          }
        }

        // Persist final token usage + USD cost to session doc (non-fatal)
        try {
          const rate = getModelRate(result.model || "gpt-5");
          const costUSD = (result.tokenUsage.inputTokens / 1000) * rate.input
                        + (result.tokenUsage.outputTokens / 1000) * rate.output;
          await sessionRef.update({
            inputTokens: result.tokenUsage.inputTokens,
            outputTokens: result.tokenUsage.outputTokens,
            costUSD: Math.round(costUSD * 100000) / 100000,
            creditsUsed: actualCost,
            model: result.model || "gpt-5",
          });
        } catch (e) {
          console.error("[brain] Failed to update token usage on session:", e);
        }

        // Auto-refill + post-session email notifications (all non-fatal)
        try {
          const userSnap = await db.collection("users").doc(uid).get();
          const userData = userSnap.data() ?? {};
          const newBalance = (userData.creditBalance as number) ?? 0;

          await checkAndTriggerAutoRefill(uid, newBalance, createAutoRefillUrl);

          if (isResendConfigured()) {
            const billingDefaults = await getBillingDefaults();
            const emailThreshold = billingDefaults.emailCreditWarningThreshold;

            // Low-credits warning — send at most once per 24 hours
            if (newBalance < emailThreshold) {
              const lastSentMs = (userData.lowCreditEmailSentAt as number | undefined) ?? 0;
              const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
              if (lastSentMs < twentyFourHoursAgo) {
                sendLowCreditsEmail(uid, newBalance, emailThreshold)
                  .then(() =>
                    db.collection("users").doc(uid).update({
                      lowCreditEmailSentAt: Date.now(),
                    })
                  )
                  .catch((e) => console.error("[brain] Low-credits email failed (non-fatal):", e));
              }
            }

            // Session complete notification — only if user opted in
            if (userData.notifySessionComplete === true && result.sessionId) {
              const sessionTitle = rebuttalContext
                ? `[Rebuttal ${rebuttalContext.rebuttalRound}] ${question.slice(0, 70)}`
                : question.slice(0, 80);
              sendSessionCompleteEmail(uid, result.sessionId, sessionTitle, actualCost)
                .catch((e) => console.error("[brain] Session-complete email failed (non-fatal):", e));
            }
          }
        } catch (e) {
          console.error("[brain] Post-session notifications failed (non-fatal):", e);
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
    if (!runSucceeded && !isAdminRun && uid && db) {
      await reconcileCredits(uid, estimatedCost, sessionId, "brain_failure_refund");
    }

    clearTimeout(sessionTimer);
    if (!res.writableEnded) res.end();
  }
});

export default router;
