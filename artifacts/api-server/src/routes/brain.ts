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
import { z } from "zod";
import { safeError } from "../lib/safeError.js";
import { runBrainSession, type CourtConfig, type RebuttalContext, type RelayContext } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { calculateActualCredits, estimateSessionCreditsCalibrated, estimateFixedPipelineCost, getModelRate } from "../lib/creditEngine.js";
import { calculateLiveCredits } from "../lib/pricingConfig.js";
import { checkAndTriggerAutoRefill } from "../lib/creditLedger.js";
import { getBillingDefaults } from "../lib/billingDefaultsConfig.js";
import {
  sendLowCreditsEmail,
  sendSessionCompleteEmail,
  sendFirstSessionEmail,
  sendZeroCreditsEmail,
  isResendConfigured,
} from "../lib/emailService.js";
import { createPaymentLink, isSquareConfigured } from "../lib/squareClient.js";
import { makeRateLimiter } from "../lib/rateLimiter.js";

const router = Router();

// ── Runtime request schema ─────────────────────────────────────────────────
// Validates /run-brain body before any credit estimation or AI calls.
// Bounded integers prevent clients from requesting arbitrarily large loops.

const CaseFileItemSchema = z.object({
  id:      z.string().max(200),
  type:    z.enum(["url", "file"]),
  name:    z.string().max(500),
  content: z.string().max(200_000),
  url:     z.string().url().optional(),
});

const RebuttalContextSchema = z.object({
  challenge:       z.string().max(10_000),
  originalVerdict: z.string().max(50_000),
  rebuttalRound:   z.number().int().min(1).max(10),
  parentSessionId: z.string().max(200).optional(),
});

const RelayContextSchema = z.object({
  missingInfo:         z.string().max(10_000),
  relayRound:          z.number().int().min(1).max(10),
  originalTranscript:  z.array(z.string().max(50_000)).max(200),
  parentSessionId:     z.string().max(200).optional(),
});

const CourtConfigSchema = z.object({
  litigantCount:    z.number().int().min(1).max(10).default(3),
  confidenceTarget: z.number().int().min(50).max(100).default(80),
  maxIterations:    z.number().int().min(1).max(20).default(2),
  responseMode:     z.enum(["balanced", "thorough", "concise"]).default("balanced"),
  outputFormat:     z.enum(["report", "memo", "bullets", "verdict"]).default("report"),
  provider:         z.enum(["openai", "anthropic", "grok", "gemini"]).optional(),
  model:            z.string().max(200).optional(),
  conscience:       z.boolean().optional(),
  aiReasoning:      z.enum(["independent", "chain"]).optional(),
  maxCredits:       z.number().int().min(1).optional(),
  debateMode:       z.enum(["adversarial", "collaborative"]).optional(),
  artifactType:     z.string().max(100).optional(),
});

const RunBrainSchema = z.object({
  question:               z.string().min(1).max(10_000),
  config:                 CourtConfigSchema,
  templateId:             z.string().max(200).optional(),
  sessionId:              z.string().max(200).optional(),
  continueFromTranscript: z.array(z.string().max(50_000)).max(200).optional(),
  rebuttalContext:        RebuttalContextSchema.optional(),
  relayContext:           RelayContextSchema.optional(),
  parentSessionId:        z.string().max(200).optional(),
  caseFile:               z.array(CaseFileItemSchema).max(10).optional(),
  resumeWithFixedPipeline: z.boolean().optional(),
  failoverProvider:       z.enum(["openai", "anthropic", "grok", "gemini"]).optional(),
  // Overdraft consent — must be passed explicitly; server never assumes true.
  overdraft:              z.boolean().optional(),
});

/**
 * IP-level burst limiter — applied before auth so anonymous traffic is also
 * throttled. 30 runs per hour per IP. Generous for real users; stops hammering.
 * Admins bypass the per-UID inner limiter below but still count here.
 */
const brainIpLimiter = makeRateLimiter({
  keyFn: (req) => `brain-ip:${req.ip ?? "unknown"}`,
  limit: 30,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests. Please wait before starting another session.",
});

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

/**
 * Atomically claim the guest free trial for an IP address.
 *
 * Uses Firestore document creation (.create()) as the atomic primitive —
 * only the FIRST concurrent request that successfully creates the document
 * may proceed. All subsequent .create() calls for the same key throw
 * ALREADY_EXISTS (gRPC code 6), so the race window is closed entirely.
 *
 * The claim starts as status:"reserved" with a 2-hour expiry so that
 * failed runs (provider error, client disconnect) don't permanently burn
 * the trial. Once the session succeeds, confirmGuestSession() marks it
 * status:"used" with no expiry.
 *
 * Returns true when the caller may proceed with the free trial.
 * Returns false when the trial has already been used (or is actively
 * reserved by a concurrent request that has not yet failed).
 *
 * On Firestore errors the function fails CLOSED — guest access is denied
 * rather than granted, preventing a Firestore outage from handing out
 * unlimited free runs.
 */
async function claimGuestSession(ip: string): Promise<boolean> {
  const safeKey = ip.replace(/[./]/g, "_");
  const db = getFirestoreDb();
  if (!db) {
    // Dev/test fallback — no Firestore configured
    if (_guestMemoryFallback.has(ip)) return false;
    _guestMemoryFallback.add(ip);
    return true;
  }
  const ref = db.collection("guest_sessions").doc(safeKey);
  try {
    // .create() is atomic and fails immediately if the document already exists.
    await ref.create({
      ip,
      status: "reserved",
      reservedAt: new Date(),
      // Expiry: if the run fails and confirmGuestSession is never called,
      // the reservation lapses after 2 hours and the guest can retry.
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    return true;
  } catch (err: any) {
    const isAlreadyExists = err?.code === 6 || err?.message?.includes("ALREADY_EXISTS");
    if (!isAlreadyExists) {
      // Firestore failure — fail closed so outages don't hand out free runs
      console.error("[brain] claimGuestSession Firestore error — denying guest access:", err?.message);
      return false;
    }
    // Document exists — check whether the existing reservation has expired
    // (means a previous run failed and the 2-hour grace period has passed).
    try {
      const snap = await ref.get();
      if (!snap.exists) return true; // shouldn't happen but safe to allow
      const data = snap.data()!;
      const status = data["status"] as string | undefined;
      const expiresAt = data["expiresAt"] as { toDate?: () => Date } | Date | undefined;
      const expiresMs = expiresAt instanceof Date
        ? expiresAt.getTime()
        : (expiresAt?.toDate?.()?.getTime() ?? Infinity);
      if (status === "reserved" && expiresMs < Date.now()) {
        // Stale reservation — overwrite it so this run can proceed.
        await ref.set({
          ip,
          status: "reserved",
          reservedAt: new Date(),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });
        return true;
      }
    } catch {
      // Non-fatal — the primary ALREADY_EXISTS check already tells us to deny
    }
    return false;
  }
}

/**
 * Mark a guest session as permanently used after a successful run.
 * Removes the expiry so the reservation cannot be reclaimed by lapse.
 * Non-fatal — if this fails the reservation expires after 2 hours, which
 * is acceptable; the guest gets one automatic retry in the worst case.
 */
async function confirmGuestSession(ip: string): Promise<void> {
  const safeKey = ip.replace(/[./]/g, "_");
  const db = getFirestoreDb();
  if (!db) return; // memory fallback was already set in claimGuestSession
  try {
    await db.collection("guest_sessions").doc(safeKey).update({
      status: "used",
      usedAt: new Date(),
      expiresAt: null, // permanent — lapse reclaim is no longer possible
    });
  } catch (err: any) {
    console.error("[brain] confirmGuestSession failed (non-fatal):", err?.message);
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

router.post("/run-brain", brainIpLimiter, async (req, res) => {
  // ── Auth fast-path ────────────────────────────────────────────────────────
  // Validate auth token (or confirm guest intent) BEFORE touching the body,
  // so unauthenticated / malformed requests never reach Firestore or the
  // credit engine. Previously the body was destructured and cost-estimation
  // ran before auth, which caused 500s on empty-body requests.
  const earlyAuthHeader = req.headers["authorization"];
  if (earlyAuthHeader?.startsWith("Bearer ")) {
    const earlyDb = getFirestoreDb();
    if (!earlyDb || !isFirebaseConfigured()) {
      res.status(503).json({ message: "Auth service unavailable." });
      return;
    }
    const earlyDecoded = await verifyIdToken(earlyAuthHeader.slice(7));
    if (!earlyDecoded) {
      res.status(401).json({ message: "Invalid or expired auth token." });
      return;
    }
    // Token is valid — fall through to full processing below.
  }
  // No Authorization header → guest path, allowed to continue.

  // Runtime schema validation — rejects malformed bodies before any credit
  // estimation or AI calls. Bounded integers prevent unbounded debate loops.
  const parsed = RunBrainSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const {
    question,
    config,
    templateId,
    sessionId: clientSessionId,
    continueFromTranscript,
    rebuttalContext,
    relayContext,
    parentSessionId,
    caseFile,
    resumeWithFixedPipeline,
    failoverProvider,
    overdraft,   // finding #10: was silently dropped; now included in schema
  } = parsed.data;

  // Mint a fresh session ID server-side by default.
  // New sessions always get a fresh server-minted ID — client-supplied IDs are
  // never accepted for new runs. Resumed sessions may supply their existing ID
  // via clientSessionId, but ownership is verified against the caller's uid
  // AFTER the auth section below resolves uid (see "Resume ownership check").
  let sessionId: string = crypto.randomUUID();

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
  // Tracks whether a guest session was atomically claimed for this request.
  // Set to the client IP when claimGuestSession() succeeds so that the finally
  // block can permanently confirm the run (or let the reservation lapse on failure).
  let guestIp: string | null = null;
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

    // Item 12: require email verification before consuming credits.
    // OAuth users (Google/Apple) are always verified. Email+password users
    // must click their verification link first.
    // decoded.emailVerified is undefined (not false) in dev mode where Firebase
    // is not fully configured — treat undefined as "not blocked" so local dev works.
    if (decoded.emailVerified === false) {
      res.status(403).json({ message: "Please verify your email address before running a session." });
      return;
    }

    // ── Resume ownership check ────────────────────────────────────────────────
    // If the client supplied an existing session ID for a genuine resume/rebuttal
    // continuation, verify the caller actually owns that session before using it.
    // New sessions (no clientSessionId) always keep the server-minted UUID above.
    // Guests can never supply a session ID (they have no account), so this only
    // runs for authenticated users.
    if (clientSessionId && (continueFromTranscript?.length || resumeWithFixedPipeline) && db) {
      try {
        const existingSnap = await db.collection("sessions").doc(clientSessionId).get();
        if (!existingSnap.exists || existingSnap.data()?.userId !== uid) {
          res.status(403).json({ message: "Session not found or access denied." });
          return;
        }
        sessionId = clientSessionId;
      } catch {
        // Firestore unavailable — keep the fresh server-minted ID (safe fallback)
      }
    }

    if (!isAdminRun) {
      // Resolve overdraft limit if user opted in
      let overdraftLimit = 0;
      const overdraftRequested = overdraft === true;
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
    // claimGuestSession uses Firestore .create() as an atomic lock so two
    // concurrent requests from the same IP cannot both slip through.
    const ip = getClientIp(req);
    const claimed = await claimGuestSession(ip);
    if (!claimed) {
      const { signupBonusCredits } = await getBillingDefaults();
      res.status(402).json({
        message:
          `Guest sessions are limited to one free trial. Create a free account to continue — you'll receive ${signupBonusCredits ?? 500} credits.`,
        guestLimitReached: true,
      });
      return;
    }
    // Store the IP so the finally block can permanently confirm the run on success
    // or allow the 2-hour reservation to lapse naturally on failure.
    guestIp = ip;
  }

  // ── SSE headers ────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Wire client disconnect → abort signal so server-side AI calls stop immediately.
  // Must listen on `res` (the writable response stream), not `req` (the readable
  // request stream). For SSE the request body is already fully consumed after
  // header parsing; only the response "close" event fires when the client disconnects.
  const abortCtrl = new AbortController();
  res.on("close", () => abortCtrl.abort());

  // Hard 10-minute timeout — aborts if client stays connected but session hangs
  const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
  const sessionTimer = setTimeout(() => {
    console.warn("[brain] Session hard-timeout after 10 minutes — aborting.");
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
      relayContext,
      caseFile,
      resumeWithFixedPipeline,
      forcedProvider: failoverProvider,
      res,
      abortSignal: abortCtrl.signal,
    });

    runSucceeded = true;
    actualCost = result.creditsUsed;

    // ── Post-run: credit settlement + persist session ──────────────────────
    //
    // IMPORTANT: each step is in its own try/catch so a Firestore failure in
    // one stage can never silently skip a later stage. In particular, credit
    // settlement (step 1) must not be skipped because session persistence
    // (step 2) failed — the user was charged the estimated cost and any excess
    // must be refunded regardless of whether the session doc write succeeded.
    if (db && uid) {
      const sessionRef = db.collection("sessions").doc(result.sessionId);
      const sessionTitle = rebuttalContext
        ? `[Rebuttal ${rebuttalContext.rebuttalRound}] ${question.slice(0, 70)}`
        : question.slice(0, 80);

      // ── Step 1: Credit settlement ─────────────────────────────────────────
      // Runs unconditionally. If this fails, the reservation made before the
      // run expires naturally via the failure-refund path in the finally block.
      if (!isAdminRun) {
        try {
          actualCost = await calculateLiveCredits(
            result.model || "gpt-5",
            result.tokenUsage.inputTokens,
            result.tokenUsage.outputTokens
          );

          // Reconcile: actual < estimated → refund the difference
          const refund = Math.max(0, estimatedCost - actualCost);
          if (refund > 0) {
            await reconcileCredits(uid, refund, result.sessionId, "brain_reconcile");
          }

          // Reconcile: actual > estimated → charge the overage.
          // The estimate converges to real cost over time via calibration but a
          // gap can remain, so this is not a rare path.
          if (actualCost > estimatedCost) {
            const overage = actualCost - estimatedCost;
            const overageCollected = await reserveCredits(uid, overage, result.sessionId, "brain_overage")
              .catch(() => false);
            if (!overageCollected) {
              // Balance insufficient — session already delivered, overage uncollectable.
              // Write a zero-debit ledger entry so the shortfall appears in the audit trail.
              console.warn(`[brain] overage uncollected uid=${uid} sessionId=${result.sessionId} overage=${overage}`);
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
        } catch (e) {
          console.error("[brain] Credit settlement failed:", e);
          // actualCost stays as result.creditsUsed (the pre-run estimate).
          // The finally block will handle the full refund via brain_failure_refund
          // only when runSucceeded is false — here it's true so we rely on the
          // next deploy + manual reconciliation for any settlement gap.
        }
      }

      // ── Step 2: Session document persistence ─────────────────────────────
      // Non-fatal — the result was already streamed to the client and credits
      // were already settled above. A failed write here means the session won't
      // appear in the History page, but no financial data is lost.
      try {
        await sessionRef.set({
          sessionId: result.sessionId,
          userId: uid,
          title: sessionTitle,
          question,
          templateId: templateId ?? null,
          confidence: Number.isNaN(result.confidence) ? 0 : result.confidence,
          creditsUsed: actualCost,
          fixedStageTokens: result.fixedStageTokens,
          status: result.pauseReason === "credit_cap"
            ? "paused_credit_cap"
            : result.courtroomOutcome?.reason === "not_enough"
              ? "relay_needed"
              : "complete",
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
          ...(caseFile && caseFile.length > 0 ? {
            caseFileMeta: caseFile.map(({ id, type, name, url }) => ({ id, type, name, url: url ?? null })),
          } : {}),
          artifactPath: result.artifactPath ?? null,
          courtroomOutcome: result.courtroomOutcome ?? null,
          relayCount: result.relayCount ?? 0,
          relayQuestion: result.relayQuestion ?? null,
          ...(rebuttalContext ? {
            isRebuttal: true,
            rebuttalRound: rebuttalContext.rebuttalRound,
            rebuttalChallenge: rebuttalContext.challenge,
            parentSessionId: parentSessionId ?? null,
          } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error("[brain] Session persistence failed (non-fatal):", e);
      }

      // ── Step 3: Token usage + USD cost annotation ─────────────────────────
      // Best-effort update — provides accurate cost telemetry in the dashboard.
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
        console.error("[brain] Token usage annotation failed (non-fatal):", e);
      }

      // ── Step 4: Post-session notifications ───────────────────────────────
      try {
        const userSnap = await db.collection("users").doc(uid).get();
        const userData = userSnap.data() ?? {};
        const newBalance = (userData.creditBalance as number) ?? 0;

        await checkAndTriggerAutoRefill(uid, newBalance, createAutoRefillUrl);

        if (isResendConfigured()) {
          const billingDefaults = await getBillingDefaults();
          const emailThreshold = billingDefaults.emailCreditWarningThreshold;

          if (newBalance < emailThreshold) {
            const lastSentMs = (userData.lowCreditEmailSentAt as number | undefined) ?? 0;
            if (lastSentMs < Date.now() - 24 * 60 * 60 * 1000) {
              sendLowCreditsEmail(uid, newBalance, emailThreshold)
                .then(() => db.collection("users").doc(uid).update({ lowCreditEmailSentAt: Date.now() }))
                .catch((e) => console.error("[brain] Low-credits email failed (non-fatal):", e));
            }
          }

          if (userData.notifySessionComplete === true && result.sessionId) {
            sendSessionCompleteEmail(uid, result.sessionId, sessionTitle, actualCost)
              .catch((e) => console.error("[brain] Session-complete email failed (non-fatal):", e));
          }

          if (!userData.firstSessionEmailSent && result.sessionId) {
            sendFirstSessionEmail(uid, result.sessionId, sessionTitle)
              .then(() => db.collection("users").doc(uid).update({ firstSessionEmailSent: true }))
              .catch((e) => console.error("[brain] First-session email failed (non-fatal):", e));
          }

          if (newBalance <= 0) {
            const lastZeroMs = (userData.zeroCreditsEmailSentAt as number | undefined) ?? 0;
            if (Date.now() - lastZeroMs > 24 * 60 * 60 * 1000) {
              sendZeroCreditsEmail(uid)
                .then(() => db.collection("users").doc(uid).update({ zeroCreditsEmailSentAt: Date.now() }))
                .catch((e) => console.error("[brain] Zero-credits email failed (non-fatal):", e));
            }
          }
        }

        db.collection("users").doc(uid).update({ lastSessionAt: Date.now() })
          .catch((e) => console.error("[brain] lastSessionAt update failed (non-fatal):", e));
      } catch (e) {
        console.error("[brain] Post-session notifications failed (non-fatal):", e);
      }

      // ── Step 5: session_turns subcollection ──────────────────────────────
      try {
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
        console.error("[brain] session_turns write failed (non-fatal):", e);
      }
    }
  } catch (err: any) {
    console.error("[brain] Unhandled session error:", err);
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: safeError(err) })}\n\n`
      );
    }
  } finally {
    // If run failed and credits were reserved, refund the full reservation as a ledger entry
    if (!runSucceeded && !isAdminRun && uid && db) {
      await reconcileCredits(uid, estimatedCost, sessionId, "brain_failure_refund");
    }

    // Confirm the guest session on success so it's permanently locked.
    // On failure, the 2-hour reservation lapses naturally — the guest gets a retry
    // if the failure was on our side (provider error, timeout), but cannot replay
    // a completed session by claiming the run "failed".
    if (runSucceeded && guestIp) {
      await confirmGuestSession(guestIp);
    }

    clearTimeout(sessionTimer);
    if (!res.writableEnded) res.end();
  }
});

export default router;
