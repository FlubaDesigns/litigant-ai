import { PAID_ACCESS_NOTE } from "@workspace/api-zod/session";
import { CREDITS_PER_DOLLAR } from "@workspace/api-zod/billing";
import { LimitsUnavailableError } from "../lib/adminLimitsConfig.js";
import { prepareSession, priceCalls, annotateCalls, type CallUsage } from "../lib/sessionPricing.js";
import { getTemplate } from "../lib/templateStore.js";
import { CourtConfigSchema, canCreateArtifacts, applyArtifactAccess } from "@workspace/api-zod/session";
import { claimSessionRun, writeSessionRun, releaseSessionRun, SessionRunError, type SessionRunLease } from "../lib/sessionRunLock.js";
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
 *      price snapshot accepted before the run (sessionPricing.ts).
 *      - actual < estimated → refund the difference (type="refund", source="brain_reconcile")
 *      - actual > estimated → charge the overage (a second reserveCredits call)
 *      - run failed         → full refund of the reservation (source="brain_failure_refund")
 *
 * ## Guest mode
 *   Admin invitations use authenticated temporary accounts and the same ledger.
 *
 * Session balance changes share creditLedger.ts with payments and signup grants.
 * See docs/credits.md §5 for the full lifecycle diagram.
 */
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { safeError } from "../lib/safeError.js";
import { runBrainSession, type CourtConfig, type RebuttalContext, type RelayContext } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";


import { checkAndTriggerAutoRefill, reserveCredits, reconcileCredits } from "../lib/creditLedger.js";
import { getBillingDefaults } from "../lib/billingDefaultsConfig.js";
import {
  sendTrackedEmail,
  sendLowCreditsEmail,
  sendSessionCompleteEmail,
  sendFirstSessionEmail,
  sendZeroCreditsEmail,
  isResendConfigured,
} from "../lib/emailService.js";
import { getCourtesyCreditEligibility } from "../lib/creditLedger.js";
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
  content: z.string().max(12_000),
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
  const creditAmount = dollars * CREDITS_PER_DOLLAR;
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
  if (!earlyAuthHeader?.startsWith("Bearer ")) {
    res.status(401).json({message: "Sign in or use a guest invitation to start a session."});
    return;
  }

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
  let {
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

  if ((rebuttalContext && relayContext) || (clientSessionId && (rebuttalContext || relayContext))) {
    res.status(400).json({ message: "Choose one continuation type per request." });
    return;
  }

  // Mint a fresh session ID server-side by default.
  // New sessions always get a fresh server-minted ID — client-supplied IDs are
  // never accepted for new runs. Resumed sessions may supply their existing ID
  // via clientSessionId, but ownership is verified against the caller's uid
  // AFTER the auth section below resolves uid (see "Resume ownership check").
  let sessionId: string = crypto.randomUUID();

  let effectiveConfig: CourtConfig = {
    ...config,
    litigantCount: config.litigantCount ?? 3,
    confidenceTarget: config.confidenceTarget ?? 80,
    maxIterations: config.maxIterations ?? 2,
    responseMode: config.responseMode ?? "balanced",
    outputFormat: config.outputFormat ?? "report",
  };

  let prepared: Awaited<ReturnType<typeof prepareSession>>;
  let estimatedCost = 0;
  let courtesyLimit = 0;
  let previousSession: Record<string, any> | null = null;
  const runCalls: CallUsage[] = [];
  let parentSession: Record<string, any> | null = null;
  let templateSystemPrompt: string | undefined;

  // ── Auth + credit reservation ─────────────────────────────────────────────
  let uid: string | null = null;
  let isAdminRun = false;
  const authHeader = req.headers["authorization"];
  const db = getFirestoreDb();

  let runLease: SessionRunLease | null = null;
  try {
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
    if (decoded.emailVerified === false && !decoded.guest) {
      res.status(403).json({ message: "Please verify your email address before running a session." });
      return;
    }

    // ── Resume ownership check ────────────────────────────────────────────────
    // If the client supplied an existing session ID for a genuine resume/rebuttal
    // continuation, verify the caller actually owns that session before using it.
    // New sessions (no clientSessionId) always keep the server-minted UUID above.
    // Guests can never supply a session ID (they have no account), so this only
    // runs for authenticated users.
    if (clientSessionId && db) {
      try {
        const claimed = await claimSessionRun(db, clientSessionId, uid);
        runLease = claimed.lease;
        sessionId = clientSessionId;
        previousSession = claimed.session;
      } catch (error) {
        res.status(error instanceof SessionRunError ? error.status : 503).json({
          message: error instanceof SessionRunError ? error.message : "Could not load the saved session. Please retry.",
        });
        return;
      }
    }

    if (db && (rebuttalContext || relayContext)) {
      parentSessionId = rebuttalContext?.parentSessionId ?? relayContext?.parentSessionId;
      if (!parentSessionId) {
        res.status(400).json({ message: "A saved parent session is required." }); return;
      }
      try {
        const parent = (await db.collection("sessions").doc(parentSessionId).get()).data();
        if (!parent || parent.userId !== uid) {
          res.status(403).json({ message: "Parent session not found or access denied." }); return;
        }
        parentSession = parent;
        if (rebuttalContext) rebuttalContext = {
          ...rebuttalContext, originalVerdict: parent.finalAnswer ?? "",
          rebuttalRound: Number(parent.rebuttalRound ?? 0) + 1,
        };
        if (relayContext) relayContext = {
          ...relayContext,
          originalTranscript: String(parent.transcript ?? "").split("\n\n---\n\n").filter(Boolean),
          relayRound: Number(parent.relayCount ?? 0) + 1,
        };
      } catch {
        res.status(503).json({ message: "Could not load the parent session. Please retry." }); return;
      }
    }
  }

  const sourceSession = previousSession ?? parentSession;
  if (sourceSession) {
    templateId = sourceSession.templateId ?? undefined;
    question = sourceSession.question ?? question;
    caseFile = sourceSession.caseFile ?? [];
    effectiveConfig = { ...effectiveConfig, ...sourceSession.config,
      ...(previousSession ? { maxCredits: config.maxCredits } : {}) };
  }
  if (previousSession) {
    continueFromTranscript = String(previousSession.transcript ?? "").split("\n\n---\n\n").filter(Boolean);
    resumeWithFixedPipeline = previousSession.status === "paused_credit_cap"
      && continueFromTranscript.some(line => line.startsWith("**Moderator (Summary):**"));
  }

  if (uid && !isAdminRun) {
    const account = (await db!.collection("users").doc(uid).get()).data();
    const proAllowed = canCreateArtifacts(account?.plan);
    if (templateId && !proAllowed) {
      res.status(403).json({ message: PAID_ACCESS_NOTE, code: "PAID_ACCESS_REQUIRED" });
      return;
    }
    effectiveConfig = applyArtifactAccess(effectiveConfig, proAllowed);
  }
  try {
    prepared = await prepareSession(effectiveConfig, resumeWithFixedPipeline === true);
    effectiveConfig = prepared.config;
    const previousCharge = Number(previousSession?.creditsUsed ?? 0);
    if (previousCharge >= prepared.config.maxCredits) {
      res.status(402).json({message:"Raise the session credit cap above the amount already used before continuing."});
      return;
    }
    effectiveConfig = { ...effectiveConfig, maxCredits: prepared.config.maxCredits - previousCharge };
    estimatedCost = Math.min(prepared.estimatedCredits, effectiveConfig.maxCredits!);
    if (templateId) {
      const template = await getTemplate(templateId, !!sourceSession);
      if (!template) { res.status(400).json({message:"Template not found"}); return; }
      templateSystemPrompt = template.systemPrompt;
    }
  } catch (error) {
    res.status(error instanceof LimitsUnavailableError ? 503 : 400).json({message: error instanceof Error ? error.message : "Invalid session configuration"});
    return;
  }
  if (uid) {
    if (runLease && db) {
      try { await writeSessionRun(db, runLease, {}); }
      catch (error) {
        res.status(error instanceof SessionRunError ? error.status : 503).json({ message: "Could not confirm the session run. Reload it from History." });
        return;
      }
    }
    if (!isAdminRun) {
      // Account and paid top-up history govern courtesy credit; the admin ceiling is authoritative.
      const account = (await db!.collection("users").doc(uid).get()).data();
      const balance = Number(account?.creditBalance ?? 0);
      if (balance < 0) {
        res.status(402).json({message:"Please top up to clear your balance before another conversation.", topUpRequired:true});
        return;
      }
      if (await getCourtesyCreditEligibility(uid)) courtesyLimit = prepared.limits?.overdraftLimit ?? 0;
      effectiveConfig.maxCredits = Math.min(effectiveConfig.maxCredits!, balance + courtesyLimit);
      // Guest invitations have a hard allowance: reserve the whole execution
      // budget so simultaneous sessions cannot spend the same trial credits.
      if (account?.guestInvitationId) estimatedCost = effectiveConfig.maxCredits;
      // Keep the saved config and execution budget aligned.
      prepared.config.maxCredits = Number(previousSession?.creditsUsed ?? 0) + effectiveConfig.maxCredits;
      if (estimatedCost <= 0) {
        res.status(402).json({message:"Please top up before starting a conversation.", topUpRequired:true});
        return;
      }

      // Optimistic credit reservation: deduct estimatedCost upfront.
      // Every balance change (reservation, refund, failure refund) is ledgered atomically.
      try {
        const reserved = await reserveCredits(uid, estimatedCost, sessionId, "brain_reservation", courtesyLimit);
        if (!reserved) {
          res.status(402).json({
            message: `Insufficient credits. This session requires approximately ${estimatedCost} credits.`,
            overdraftLimit: courtesyLimit,
          });
          return;
        }
      } catch (err) {
        console.error("[brain] Credit reservation failed:", err);
        res.status(503).json({ message: "Credit service temporarily unavailable. Please try again." });
        return;
      }
    }
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
  let timedOut = false;
  const sessionTimer = setTimeout(() => {
    timedOut = true;
    console.warn("[brain] Session hard-timeout after 10 minutes — aborting.");
    abortCtrl.abort();
  }, SESSION_TIMEOUT_MS);

  let runSucceeded = false;
  let actualCost = 0;
  let resultSaved = false;

  try {
    const result = await runBrainSession({
      question,
      config: effectiveConfig,
      templateSystemPrompt,
      deferCompletion: true,
      priceCalls: calls => priceCalls(calls, prepared.rates),
      onCallUsage: call => runCalls.push(...annotateCalls([call], prepared.rates)),
      enabledProviders: prepared.enabledProviders,
      fallbackModels: prepared.fallbackModels,
      estimatedCredits: estimatedCost,
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
    const relayCount = Math.max(result.relayCount ?? 0, sourceSession?.relayCount ?? 0);
    const rebuttalRound = rebuttalContext?.rebuttalRound ?? sourceSession?.rebuttalRound ?? 0;
    // One status is used for both the stored session and its completion event.
    const status = result.pauseReason === "credit_cap" ? "paused_credit_cap"
      : result.pauseReason === "iteration_limit" ? "incomplete"
      : result.courtroomOutcome?.reason === "not_enough" ? "relay_needed"
      : result.convergenceFailure ? "incomplete" : "complete";

    // ── Post-run: credit settlement + persist session ──────────────────────
    //
    // IMPORTANT: each step is in its own try/catch so a Firestore failure in
    // one stage can never silently skip a later stage. In particular, credit
    // settlement (step 1) must not be skipped because session persistence
    // (step 2) failed — the user was charged the estimated cost and any excess
    // must be refunded regardless of whether the session doc write succeeded.
    if (db && uid) {
      const sessionUid = uid;
      const sessionRef = db.collection("sessions").doc(result.sessionId);
      const sessionTitle = rebuttalContext
        ? `[Rebuttal ${rebuttalContext.rebuttalRound}] ${question.slice(0, 70)}`
        : question.slice(0, 80);

      // ── Step 1: Credit settlement ─────────────────────────────────────────
      // Runs unconditionally. If this fails, the reservation made before the
      // run expires naturally via the failure-refund path in the finally block.
      if (!isAdminRun) {
        try {
          actualCost = Math.min(effectiveConfig.maxCredits!, result.creditsUsed);

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
            const overageCollected = await reserveCredits(uid, overage, result.sessionId, "brain_overage", courtesyLimit)
              .catch(() => false);
            if (!overageCollected) {
              actualCost = estimatedCost; // Charge/report only the amount actually collected.
              // Balance insufficient — absorb the uncollected overage.
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
          // Run succeeded but settlement crashed — refund the full reservation
          // immediately so the user's balance is not permanently stranded.
          // A durable audit entry is written so an admin can investigate the gap.
          actualCost = 0;
          await reconcileCredits(uid, estimatedCost, result.sessionId, "brain_failure_refund")
            .catch((e2) => console.error("[brain] Settlement-failure refund also failed uid=%s:", uid, e2));
          db?.collection("credit_transactions").add({
            userId: uid,
            type:   "settlement_failure",
            amount: 0,
            balanceAfter: null,
            source: "brain_settlement_crashed",
            sessionId: result.sessionId,
            estimatedCost,
            createdAt: FieldValue.serverTimestamp(),
          }).catch((e2) => console.error("[brain] Failed to record settlement failure:", e2));
        }
      }

      // ── Step 2: Session document persistence ─────────────────────────────
      // A completion event is sent only after persistence. Failure here causes
      // an error event and a refund of the remaining collected charge.
      try {
        const pricedCalls = annotateCalls(result.tokenUsage.calls ?? [], prepared.rates);
        const savedResult = {
          sessionId: result.sessionId,
          userId: uid,
          title: previousSession?.title ?? sessionTitle,
          config: prepared.config,
          caseFile: caseFile ?? [],
          priceSnapshot: prepared.rates,
          callUsage: [...(previousSession?.callUsage ?? []), ...pricedCalls],
          inputTokens: Number(previousSession?.inputTokens ?? 0) + result.tokenUsage.inputTokens,
          outputTokens: Number(previousSession?.outputTokens ?? 0) + result.tokenUsage.outputTokens,
          costUSD: Number(previousSession?.costUSD ?? 0) + pricedCalls.reduce((sum, c) => sum + c.costUSD!, 0),
          model: result.model || "gpt-5",
          question,
          templateId: templateId ?? null,
          pauseReason: result.pauseReason ?? null,
          confidence: Number.isNaN(result.confidence) ? 0 : result.confidence,
          creditsUsed: Number(previousSession?.creditsUsed ?? 0) + actualCost,
          fixedStageTokens: result.fixedStageTokens,
          status,
          finalAnswer: result.finalAnswer,
          debateNotes: [previousSession?.debateNotes, result.debateNotes].filter(Boolean).join("\n\n---\n\n"),
          transcript: Array.isArray(result.transcript) ? result.transcript.join("\n\n---\n\n") : result.transcript ?? "",
          caveats: result.caveats,
          artifacts: result.artifacts,
          conscienceVersion: result.conscienceVersion,
          starred: previousSession?.starred ?? false,
          archived: previousSession?.archived ?? false,
          shared: previousSession?.shared ?? false,
          shareId: previousSession?.shareId ?? null,
          ...(caseFile && caseFile.length > 0 ? {
            caseFileMeta: caseFile.map(({ id, type, name, url }) => ({ id, type, name, url: url ?? null })),
          } : {}),
          artifactPath: result.artifactPath ?? null,
          courtroomOutcome: result.courtroomOutcome ?? null,
          relayCount,
          rebuttalRound,
          parentSessionId: parentSessionId ?? previousSession?.parentSessionId ?? null,
          relayQuestion: result.relayQuestion ?? null,
          ...(rebuttalContext ? {
            isRebuttal: true,
            rebuttalChallenge: rebuttalContext.challenge,
          } : {}),
          createdAt: previousSession?.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (runLease) await writeSessionRun(db, runLease, savedResult);
        else await sessionRef.set(savedResult, { merge: true });
      } catch (e) {
        console.error("[brain] Session persistence failed:", e);
        throw new Error("The result could not be saved. Your session was not marked complete. Please contact support.");
      }

      // ── Step 4: Post-session notifications ───────────────────────────────
      try {
        const userSnap = await db.collection("users").doc(uid).get();
        const userData = userSnap.data() ?? {};
        const newBalance = (userData.creditBalance as number) ?? 0;

        await db.collection("users").doc(uid).update({ lastSessionAt: Date.now() })
          .catch((e) => console.error("[brain] lastSessionAt update failed (non-fatal):", e));

        await checkAndTriggerAutoRefill(uid, newBalance, createAutoRefillUrl);

        if (isResendConfigured()) {
          const billingDefaults = await getBillingDefaults();
          const emailThreshold = billingDefaults.emailCreditWarningThreshold;

          const notifications: Promise<boolean>[] = [];
          if (emailThreshold > 0 && newBalance < emailThreshold) notifications.push(sendTrackedEmail(sessionUid, "lowCredits",
            key => sendLowCreditsEmail(sessionUid, newBalance, emailThreshold, key),
            {sentField: "lowCreditEmailSentAt", cooldownMs: 86400_000}));
          if (status === "complete" && userData.notifySessionComplete === true && result.sessionId) {
            notifications.push(sendTrackedEmail(sessionUid, "sessionComplete",
              key => sendSessionCompleteEmail(sessionUid, result.sessionId, sessionTitle, actualCost, key), {eventId: result.sessionId}));
          }
          if (status === "complete" && result.sessionId) notifications.push(sendTrackedEmail(sessionUid, "firstSession",
            key => sendFirstSessionEmail(sessionUid, result.sessionId, sessionTitle, key), {sentField: "firstSessionEmailSent"}));
          if (newBalance <= 0) notifications.push(sendTrackedEmail(sessionUid, "zeroCredits",
            key => sendZeroCreditsEmail(sessionUid, key), {sentField: "zeroCreditsEmailSentAt", cooldownMs: 86400_000}));
          const outcomes = await Promise.allSettled(notifications);
          outcomes.forEach(outcome => {
            if (outcome.status === "rejected") console.error("[brain] Notification failed (non-fatal):", outcome.reason);
          });
        }


      } catch (e) {
        console.error("[brain] Post-session notifications failed (non-fatal):", e);
      }

      // ── Step 5: session_turns subcollection ──────────────────────────────
      try {
        const turnsCol = sessionRef.collection("session_turns");
        const oldTurns = previousSession ? await turnsCol.get() : null;
        const offset = oldTurns ? oldTurns.docs.reduce((max, d) => Math.max(max, Number(d.data().turnIndex ?? -1) + 1), 0) : 0;
        const turnWrites = result.turns.map((turn, idx) => ({
            ref: turnsCol.doc(`turn_${String(offset + idx).padStart(3, "0")}`),
            data: {
              turnIndex: offset + idx,
              role: turn.role,
              round: turn.round,
              content: turn.content,
              createdAt: FieldValue.serverTimestamp(),
            },
        }));
        if (runLease) await writeSessionRun(db, runLease, {}, turnWrites);
        else await Promise.all(turnWrites.map(write => write.ref.set(write.data)));
      } catch (e) {
        console.error("[brain] session_turns write failed (non-fatal):", e);
      }
    }
    resultSaved = true;
    if (runLease && db) {
      if (!await releaseSessionRun(db, runLease)) {
        throw new SessionRunError(409, "This run was replaced. Reload the session from History.");
      }
      runLease = null;
    }
    const transcript = Array.isArray(result.transcript) ? result.transcript.join("\n\n---\n\n") : result.transcript;
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify({
      ...result, transcript, status, relayCount, rebuttalRound, caseFile: caseFile ?? [],
      config: prepared.config,
      debateNotes: [previousSession?.debateNotes, result.debateNotes].filter(Boolean).join("\n\n---\n\n"),
      creditsUsed: Number(previousSession?.creditsUsed ?? 0) + actualCost,
      type: result.pauseReason === "credit_cap" ? "paused_post_moderator" : "done",
      transcriptLines: result.transcript, debateTranscriptLines: result.transcript,
      needsRelay: result.courtroomOutcome?.reason === "not_enough",
    })}\n\n`);
  } catch (err: any) {
    console.error("[brain] Unhandled session error:", err);
    // Keep health and error logs on the same session record. A failed resume
    // must retain its saved answer/status and respect the existing run lease.
    // User cancellation is not a service failure; hard timeouts are.
    if (db && uid && !resultSaved && (!abortCtrl.signal.aborted || timedOut)) {
      try {
        const failure = {
          callUsage: [...(previousSession?.callUsage ?? []), ...runCalls],
          priceSnapshot: prepared.rates,
          costUSD: Number(previousSession?.costUSD ?? 0) + runCalls.reduce((sum, c) => sum + (c.costUSD ?? 0), 0),
          inputTokens: Number(previousSession?.inputTokens ?? 0) + runCalls.reduce((sum, c) => sum + c.inputTokens, 0),
          outputTokens: Number(previousSession?.outputTokens ?? 0) + runCalls.reduce((sum, c) => sum + c.outputTokens, 0),
          lastRunErrorAt: FieldValue.serverTimestamp(),
          lastRunErrorMessage: timedOut ? "Session timed out." : "Session failed before completion.",
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (runLease) {
          await writeSessionRun(db, runLease, failure);
        } else {
          await db.collection("sessions").doc(sessionId).create({
            ...failure, userId: uid, title: question.slice(0, 80), question,
            config: prepared.config, templateId: templateId ?? null,
            status: "error", creditsUsed: 0, shared: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      } catch {
        console.error("[brain] Could not persist session failure", { sessionId });
      }
    }
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: safeError(err) })}\n\n`
      );
    }
  } finally {
    // If run failed and credits were reserved, refund the full reservation as a ledger entry
    if (!resultSaved && !isAdminRun && uid && db) {
      await reconcileCredits(uid, runSucceeded ? actualCost : estimatedCost, sessionId, "brain_failure_refund").catch(error => console.error("[brain] Refund requires reconciliation", {uid, sessionId, estimatedCost, error}));
    }

    clearTimeout(sessionTimer);
    if (!res.writableEnded) res.end();
  }
  } finally {
    if (runLease && db) {
      await releaseSessionRun(db, runLease).catch(error => {
        console.error("[brain] Session lock release failed; lease will expire", { sessionId, error });
      });
    }
  }
});

router.post("/session-estimate", makeRateLimiter({ keyFn: req => `quote:${(req.ip ?? "unknown")}`, windowMs: 60_000, limit: 120, message: "Too many estimate requests" }), async (req, res) => {
  const parsed = CourtConfigSchema.safeParse(req.body?.config);
  if (!parsed.success) return res.status(400).json({message:"Invalid session configuration"});
  try {
    const quote = await prepareSession(parsed.data);
    return res.json({config:quote.config, estimatedCredits:quote.estimatedCredits, maxCredits:quote.config.maxCredits});
  } catch (e) { return res.status(e instanceof LimitsUnavailableError ? 503 : 400).json({message:e instanceof Error ? e.message : "Estimate unavailable"}); }
});
export default router;
