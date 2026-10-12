import { mergeModelProvenance } from "../lib/modelProvenance.js";
import { PAID_ACCESS_NOTE, storedSessionRecord, sessionCompleteNotificationsEnabled } from "@workspace/api-zod/session";
import { LimitsUnavailableError } from "../lib/adminLimitsConfig.js";
import { prepareSession, priceCalls, annotateCalls, type CallUsage } from "../lib/sessionPricing.js";
import { getTemplate } from "../lib/templateStore.js";
import { CourtConfigSchema, canCreateArtifacts, applyArtifactAccess } from "@workspace/api-zod/session";
import { claimSessionRun, writeSessionRun, releaseSessionRun, SessionRunError, type SessionRunLease } from "../lib/sessionRunLock.js";
/**
 * Brain route — POST /run-brain
 *
 * Reserve the complete execution allowance in an atomic, lease-backed credit run.
 * Save each result and its settlement obligation together, then refund unused
 * allowance atomically with the ledger and displayed financial state. Failed or
 * cancelled work receives the existing full-refund policy. An interrupted worker
 * leaves recoverable state; no provider calls or top-ups occur in credit recovery.
 *
 * Monetary purchases remain in creditLedger; run settlement is in
 * creditRunSettlement. See docs/billing-recovery.md for the lifecycle and rollout.
 */
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { safeError } from "../lib/safeError.js";
import { runBrainSession, type CourtConfig, type RebuttalContext, type RelayContext } from "../lib/brainEngine.js";
import { verifyIdToken, getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";


import { reserveCreditRun, prepareCreditRunSettlement, persistCreditRunFailure, applyCreditRunSettlement, recoverCreditRuns, getSettledCreditBalance, type CreditRunState } from "../lib/creditRunSettlement.js";
import { checkAndTriggerAutoRefill } from "../lib/creditLedger.js";
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
  const creditRunId = crypto.randomUUID();
  let creditReserved = false;
  let billingState: CreditRunState = { chargedCredits: 0, targetCharge: 0, reservedCredits: 0, settlementStatus: "settled" };
  let fullAccess = false;

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
    fullAccess = canCreateArtifacts((await db.collection("users").doc(uid).get()).data()?.plan, isAdminRun);
    if (!fullAccess && (clientSessionId || parentSessionId || rebuttalContext || relayContext || continueFromTranscript?.length || resumeWithFixedPipeline)) {
      res.status(403).json({message: PAID_ACCESS_NOTE, code: "PAID_ACCESS_REQUIRED"}); return;
    }

    // Item 12: require email verification before consuming credits.
    // OAuth users (Google/Apple) are always verified. Email+password users
    // must click their verification link first.
    // decoded.emailVerified is undefined (not false) in dev mode where Firebase
    // is not fully configured — treat undefined as "not blocked" so local dev works.
    if (decoded.emailVerified === false && !decoded.guest) {
      res.status(403).json({ message: "Please verify your email address before running a session." });
      return;
    }

    try { await recoverCreditRuns(uid); }
    catch { res.status(503).json({message:"Your previous credit settlement is still pending. Please retry."}); return; }

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
        if (previousSession.memorySaved === false) throw new SessionRunError(403, "This Free conversation has no saved memory.");
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
        if (!parent || parent.userId !== uid || parent.memorySaved === false) {
          res.status(403).json({ message: "Parent session not found or access denied." }); return;
        }
        parentSession = parent;
        if (rebuttalContext) rebuttalContext = {
          ...rebuttalContext, originalVerdict: parent.finalAnswer ?? "",
          rebuttalRound: Number(parent.rebuttalRound ?? 0) + 1,
        };
        if (relayContext) relayContext = {
          ...relayContext,
          originalTranscript: Array.isArray(parent.transcriptLines) ? parent.transcriptLines : String(parent.transcript ?? "").split("\n\n---\n\n").filter(Boolean),
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
    continueFromTranscript = Array.isArray(previousSession.transcriptLines) ? previousSession.transcriptLines : String(previousSession.transcript ?? "").split("\n\n---\n\n").filter(Boolean);
    const lastSummary = continueFromTranscript!.reduce((last, line, i) => line.startsWith("**Moderator (Summary):**") ? i : last, -1);
    const lastDebate = continueFromTranscript!.reduce((last, line, i) => /^\*\*(?:Litigant|Conscience|Moderator \(Round)/.test(line) ? i : last, -1);
    resumeWithFixedPipeline = previousSession.status === "paused_credit_cap" && lastSummary >= 0 && lastSummary > lastDebate;
  }

  if (uid && !isAdminRun) {
    if (templateId && !fullAccess) {
      res.status(403).json({message: PAID_ACCESS_NOTE, code: "PAID_ACCESS_REQUIRED"}); return;
    }
    effectiveConfig = applyArtifactAccess(effectiveConfig, fullAccess);
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
      // All account runs reserve their complete execution allowance atomically.
      // Estimates are not independent permission to spend the same balance twice.
      if (account?.guestInvitationId) estimatedCost = effectiveConfig.maxCredits;
      if (estimatedCost > effectiveConfig.maxCredits) {
        res.status(402).json({message:`Insufficient credits. This session requires approximately ${estimatedCost} credits.`,overdraftLimit:courtesyLimit});
        return;
      }
      // Keep the saved config and execution budget aligned.
      prepared.config.maxCredits = Number(previousSession?.creditsUsed ?? 0) + effectiveConfig.maxCredits;
      if (estimatedCost <= 0) {
        res.status(402).json({message:"Please top up before starting a conversation.", topUpRequired:true});
        return;
      }

      // Atomically reserve the whole allowed cap, with a durable run lifecycle.
      // The estimate is only the minimum start check, never overlapping authority.
      try {
        const reserved = await reserveCreditRun(uid, effectiveConfig.maxCredits!, sessionId, creditRunId, courtesyLimit, Number(previousSession?.creditsUsed ?? 0));
        if (!reserved) {
          res.status(402).json({
            message: `Insufficient credits. This session requires approximately ${estimatedCost} credits.`,
            overdraftLimit: courtesyLimit,
          });
          return;
        }
        creditReserved = true;
        billingState = { chargedCredits: effectiveConfig.maxCredits!, targetCharge: 0, reservedCredits: effectiveConfig.maxCredits!, settlementStatus: "pending" };
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
      continueFromArtifact: previousSession?.artifacts,
      rebuttalContext,
      relayContext,
      caseFile,
      resumeWithFixedPipeline,
      forcedProvider: failoverProvider,
      res,
      abortSignal: abortCtrl.signal,
    });

    actualCost = result.creditsUsed;
    const provenance = result.modelProvenance
      ? mergeModelProvenance(result.modelProvenance, previousSession?.modelProvenance)
      : { model: result.model || "No completed model call", provider: result.provider ?? null, modelProvenance: null };
    const relayCount = Math.max(result.relayCount ?? 0, sourceSession?.relayCount ?? 0);
    const rebuttalRound = rebuttalContext?.rebuttalRound ?? sourceSession?.rebuttalRound ?? 0;
    // One status is used for both the stored session and its completion event.
    const status = result.cancelled ? (timedOut ? "error" : "cancelled")
      : result.pauseReason === "credit_cap" ? "paused_credit_cap"
      : result.relayQuestion || result.courtroomOutcome?.reason === "not_enough" ? "relay_needed"
      : result.pauseReason === "iteration_limit" || result.pauseReason === "output_incomplete" ? "incomplete"
      : result.convergenceFailure || result.courtroomOutcome?.reason !== "approved" ? "incomplete" : "complete";

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

      // The requested final charge is staged with the saved result. Until the
      // balance transaction commits, the difference is explicitly a held reserve.
      actualCost = result.cancelled ? 0 : Math.min(effectiveConfig.maxCredits!, result.creditsUsed);

      // ── Step 2: Session document persistence ─────────────────────────────
      // A completion event is sent only after durable result persistence. A failed
      // staging transaction leaves a recoverable full-refund reservation.
      try {
        const pricedCalls = annotateCalls(result.tokenUsage.calls ?? [], prepared.rates);
        const savedResult = storedSessionRecord({
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
          ...provenance,
          question,
          templateId: templateId ?? null,
          pauseReason: result.pauseReason ?? null,
          outputIncomplete: result.outputIncomplete ?? null,
          confidence: Number.isNaN(result.confidence) ? 0 : result.confidence,
          creditsUsed: Number(previousSession?.creditsUsed ?? 0) + actualCost,
          fixedStageTokens: result.fixedStageTokens,
          status,
          finalAnswer: result.finalAnswer,
          debateNotes: [previousSession?.debateNotes, result.debateNotes].filter(Boolean).join("\n\n---\n\n"),
          transcriptLines: Array.isArray(result.transcript) ? result.transcript : [],
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
        }, fullAccess);
        if (creditReserved) {
          billingState = await prepareCreditRunSettlement(uid, creditRunId, actualCost, savedResult, runLease);
          resultSaved = true;
          // Both attempts are idempotent. A persistent outage leaves the result
          // and refund obligation durable for the next authenticated recovery.
          try { billingState = await applyCreditRunSettlement(uid, creditRunId); }
          catch {
            try { billingState = await applyCreditRunSettlement(uid, creditRunId); }
            catch (error) { console.error("[brain] Settlement pending", { sessionId, error }); }
          }
        } else {
          if (runLease) await writeSessionRun(db, runLease, savedResult);
          else await sessionRef.set(savedResult, { merge: true });
          resultSaved = true;
        }
      } catch (e) {
        console.error("[brain] Session persistence failed:", e);
        throw new Error("Could not confirm the saved result. Check History before retrying; credit reconciliation may still be pending.");
      }

      // ── Step 4: Post-session notifications ───────────────────────────────
      try {
        const userSnap = await db.collection("users").doc(uid).get();
        const userData = userSnap.data() ?? {};
        let newBalance = (userData.creditBalance as number) ?? 0;

        await db.collection("users").doc(uid).update({ lastSessionAt: Date.now() })
          .catch((e) => console.error("[brain] lastSessionAt update failed (non-fatal):", e));

        if (!result.cancelled && billingState.settlementStatus === "settled") await checkAndTriggerAutoRefill(uid, newBalance, result.sessionId);
        newBalance = (await db.collection("users").doc(uid).get()).data()?.creditBalance ?? newBalance;

        if ((await isResendConfigured())) {
          const billingDefaults = await getBillingDefaults();
          const emailThreshold = billingDefaults.emailCreditWarningThreshold;

          const notifications: Promise<boolean>[] = [];
          const settledBalance = await getSettledCreditBalance(uid);
          if (settledBalance !== null && emailThreshold > 0 && settledBalance < emailThreshold) notifications.push(sendTrackedEmail(sessionUid, "lowCredits",
            key => sendLowCreditsEmail(sessionUid, settledBalance!, emailThreshold, key),
            {sentField: "lowCreditEmailSentAt", cooldownMs: 86400_000}));
          const notificationProfile = (await db.collection("users").doc(uid).get()).data() ?? {};
          if (fullAccess && status === "complete" && sessionCompleteNotificationsEnabled(notificationProfile) && result.sessionId) {
            notifications.push(sendTrackedEmail(sessionUid, "sessionComplete",
              key => sendSessionCompleteEmail(sessionUid, result.sessionId, sessionTitle, actualCost, key), {eventId: result.sessionId}));
          }
          if (fullAccess && status === "complete" && sessionCompleteNotificationsEnabled(notificationProfile) && result.sessionId) notifications.push(sendTrackedEmail(sessionUid, "firstSession",
            key => sendFirstSessionEmail(sessionUid, result.sessionId, sessionTitle, key), {sentField: "firstSessionEmailSent"}));
          if (settledBalance !== null && settledBalance <= 0) notifications.push(sendTrackedEmail(sessionUid, "zeroCredits",
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
      if (fullAccess) try {
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
      ...result, ...provenance, transcript, status, relayCount, rebuttalRound, caseFile: caseFile ?? [],
      config: prepared.config,
      debateNotes: [previousSession?.debateNotes, result.debateNotes].filter(Boolean).join("\n\n---\n\n"),
      creditsUsed: Number(previousSession?.creditsUsed ?? 0) + actualCost,
      creditsDebited: Number(previousSession?.creditsUsed ?? 0) + billingState.chargedCredits,
      creditsReserved: billingState.reservedCredits,
      settlementStatus: billingState.settlementStatus,
      type: result.pauseReason === "credit_cap" ? "paused_post_moderator" : "done",
      transcriptLines: result.transcript, debateTranscriptLines: result.transcript,
      needsRelay: !!result.relayQuestion,
    })}\n\n`);
  } catch (err: any) {
    console.error("[brain] Unhandled session error:", err);
    // Keep health and error logs on the same session record. A failed resume
    // must retain its saved answer/status and respect the existing run lease.
    // User cancellation is not a service failure; hard timeouts are.
    if (db && uid && !resultSaved) {
      try {
        const failure = {
          callUsage: [...(previousSession?.callUsage ?? []), ...runCalls],
          priceSnapshot: prepared.rates,
          costUSD: Number(previousSession?.costUSD ?? 0) + runCalls.reduce((sum, c) => sum + (c.costUSD ?? 0), 0),
          inputTokens: Number(previousSession?.inputTokens ?? 0) + runCalls.reduce((sum, c) => sum + c.inputTokens, 0),
          outputTokens: Number(previousSession?.outputTokens ?? 0) + runCalls.reduce((sum, c) => sum + c.outputTokens, 0),
          lastRunErrorAt: FieldValue.serverTimestamp(),
          lastRunErrorMessage: timedOut ? "Session timed out." : abortCtrl.signal.aborted ? "Session cancelled." : "Session failed before completion.",
          creditsUsed: Number(previousSession?.creditsUsed ?? 0),
          creditsDebited: Number(previousSession?.creditsUsed ?? 0) + billingState.chargedCredits,
          creditsReserved: billingState.chargedCredits,
          settlementStatus: billingState.settlementStatus,
          ...(creditReserved ? { billingRunId: creditRunId } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        };
        const failureRecord = previousSession ? failure : storedSessionRecord({
          ...failure, userId: uid, title: question.slice(0, 80), question,
          config: prepared.config, templateId: templateId ?? null,
          status: abortCtrl.signal.aborted && !timedOut ? "cancelled" : "error", shared: false,
          createdAt: FieldValue.serverTimestamp(),
        }, fullAccess);
        if (creditReserved) {
          billingState = await persistCreditRunFailure(uid, creditRunId, failureRecord, runLease);
          resultSaved = billingState.resultStored === true;
          try { billingState = await applyCreditRunSettlement(uid, creditRunId); }
          catch (error) { console.error("[brain] Refund pending; durable obligation retained", {sessionId,error}); }
        } else if (runLease) await writeSessionRun(db, runLease, failureRecord);
        else await db.collection("sessions").doc(sessionId).set(failureRecord);

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
    // Failed staging retains an active lease-backed reservation even if every
    // immediate refund write failed. Recovery releases it after the hard run window.

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
