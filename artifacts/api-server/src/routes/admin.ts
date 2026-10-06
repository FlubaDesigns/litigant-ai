import { InvalidBillingDefaultsError } from "../lib/billingDefaultsConfig.js";
import { DEFAULT_LIMITS, LIMIT_RANGES, getAdminLimits } from "../lib/adminLimitsConfig.js";
import { CourtConfigFieldsSchema } from "@workspace/api-zod/session";
import { TemplateInputFieldsSchema } from "@workspace/api-zod/templates";
import { getTemplates } from "../lib/templateStore.js";
import { Router } from "express";
import crypto from "crypto";
import { verifyIdToken, isFirebaseConfigured, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { makeRateLimiter } from "../lib/rateLimiter.js";
import { addCredits, InvalidRefundError } from "../lib/creditLedger.js";
import { FieldValue, FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getBillingDefaults, saveBillingDefaults } from "../lib/billingDefaultsConfig.js";
import { getChecklist, setChecklistItemChecked } from "../lib/checklistConfig.js";
import {
  sendAccountSuspendedEmail,
  runReengagementCampaign,
  isResendConfigured,
  renderTemplatePreview,
} from "../lib/emailService.js";
import {
  EMAIL_TEMPLATE_IDS,
  EMAIL_TEMPLATE_META,
  getTemplateConfig,
  saveTemplateConfig,
  listTemplateVersions,
  saveTemplateVersion,
  activateTemplateVersion,
  deleteTemplateVersion,
  type EmailTemplateId,
  validateTemplateContent,
} from "../lib/emailTemplateStore.js";
import {
  MultiplierSchema,
  saveMultiplierOverride,
  resetMultiplierToDefault,
} from "../lib/pricingConfig.js";
import { safeError } from "../lib/safeError.js";
import { summarizeApiUsage } from "../lib/apiUsage.js";
import {
  getAllConfiguredProviders,
  saveApiKey,
  deleteApiKey,
} from "../lib/apiKeyStore.js";
import {getAdminPricingTable, getAiStudioModels, getModelRegistry, CustomProviderSchema, validateCustomProviders, type CustomProviderDefinition} from "../lib/providerCatalog.js";
import {
  PROVIDER_MODELS,
} from "../lib/providers/index.js";
import {
  getAllCreditPacks,
  createCreditPack,
  updateCreditPack,
  deactivateCreditPack,
  CREDIT_PACK_BOUNDS,
} from "../lib/creditPacksConfig.js";
import {
  CANON_V2_FALLBACK_TEXT,
  CANON_V2_FALLBACK_VERSION,
  invalidateConscienceCache,
} from "../lib/conscienceConfig.js";
import {
  SEAT_IDS,
  getSeatBriefsConfig,
  type SeatId,
} from "../lib/seatBriefs.js";

import { InvitationInput, createInvitation, invitationView } from "../lib/guestInvitations.js";

const router = Router();

// ── Bootstrap rate limiter ────────────────────────────────────────────────────
// Applied to /admin/set-claim which is gated by master secret rather than
// Bearer token. Rate-limiting prevents brute-force against the secret and
// limits the damage from any credential exposure.
const setClaimLimiter = makeRateLimiter({
  keyFn: (req) => `set-claim:${req.ip ?? "unknown"}`,
  limit: 5,
  windowMs: 60 * 60 * 1000, // 5 attempts per hour per IP
  message: "Too many admin setup requests. Please try again later.",
});

// ── Admin auth middleware ─────────────────────────────────────────────────────

async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!isFirebaseConfigured()) {
    res.status(503).json({ error: "Firebase not configured" });
    return;
  }
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded?.admin) {
    res.status(403).json({ error: "Forbidden — admin access required" });
    return;
  }
  req.adminUid = decoded.uid;
  next();
}

function serializeDoc(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const data = doc.data() ?? {};
  const out: Record<string, unknown> = { id: doc.id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as any).toDate === "function") {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Individual invitation links are controlled only by the administrator.
router.get("/admin/guest-invitations", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    let query = db.collection("guest_invitations").orderBy("createdAt", "desc").limit(51);
    if (typeof req.query.cursor === "string") {
      const cursor = await db.collection("guest_invitations").doc(req.query.cursor).get();
      if (!cursor.exists) return res.status(400).json({error: "This page has changed. Refresh the list."});
      query = query.startAfter(cursor);
    }
    const docs = await query.get();
    const page = docs.docs.slice(0, 50);
    const invitations = await Promise.all(page.map(async doc => {
      const data = doc.data();
      const profile = data.claimedBy ? (await db.collection("users").doc(data.claimedBy).get()).data() : null;
      return invitationView(doc.id, data, profile?.creditBalance);
    }));
    return res.json({invitations, hasMore: docs.size > 50, nextCursor: docs.size > 50 ? page.at(-1)?.id : null});
  } catch { return res.status(503).json({error: "Could not load invitations."}); }
});
router.post("/admin/guest-invitations", requireAdmin, async (req, res) => {
  const parsed = InvitationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error: "Enter a name, 1–100,000 credits, Free or Member, and a future expiration."});
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    const id = await createInvitation(db, parsed.data, (req as any).adminUid);
    return res.status(201).json({id});
  } catch { return res.status(503).json({error: "Could not create invitation."}); }
});
router.delete("/admin/guest-invitations/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    await db.collection("guest_invitations").doc(req.params.id!).update({revoked: true});
    return res.json({revoked: true});
  } catch { return res.status(503).json({error: "Could not revoke invitation."}); }
});

// ── Bootstrap: set admin claim (master-secret gated, no token required) ───────

/**
 * POST /admin/set-claim
 * Body: { secret: string, email?: string, uid?: string }
 * No Bearer token required — authenticated by ADMIN_MASTER_SECRET env var.
 * Sets admin: true custom claim on the target Firebase Auth user.
 * User must sign out and back in for the claim to appear in their ID token.
 */
router.post("/admin/set-claim", setClaimLimiter, async (req, res) => {
  const masterSecret = process.env["ADMIN_MASTER_SECRET"];
  if (!masterSecret) {
    return res.status(503).json({
      error: "ADMIN_MASTER_SECRET is not set. Configure this env var on the server first.",
    });
  }
  if (!isFirebaseConfigured()) {
    return res.status(503).json({ error: "Firebase not configured" });
  }

  const { secret, email, uid } = req.body as {
    secret?: string;
    email?: string;
    uid?: string;
  };

  // Timing-safe comparison — prevents timing-oracle attacks on the master secret.
  // Consistent with squareEventHandler.ts which uses timingSafeEqual for the same reason.
  const secretBuf = Buffer.from(secret ?? "");
  const masterBuf = Buffer.from(masterSecret);
  const valid =
    secretBuf.length === masterBuf.length &&
    crypto.timingSafeEqual(secretBuf, masterBuf);
  if (!valid) {
    return res.status(403).json({ error: "Invalid master secret" });
  }
  if (!email && !uid) {
    return res.status(400).json({ error: "email or uid required" });
  }

  try {
    const authAdmin = getAuth();
    const user = email
      ? await authAdmin.getUserByEmail(email)
      : await authAdmin.getUser(uid!);

    const existing = user.customClaims ?? {};
    if (existing["admin"] === true) {
      return res.json({
        success: true,
        uid: user.uid,
        email: user.email,
        message: "User already has admin: true — no change made.",
      });
    }

    await authAdmin.setCustomUserClaims(user.uid, { ...existing, admin: true });
    return res.json({
      success: true,
      uid: user.uid,
      email: user.email,
      message: "admin: true set. User must sign out and sign back in for the claim to appear.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── System stats ──────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ userCount: 0, sessionCount: 0, txCount: 0 });

  try {
    const [usersSnap, sessionsSnap, txSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("sessions").count().get(),
      db.collection("credit_transactions").count().get(),
    ]);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentSnap = await db
      .collection("sessions")
      .where("createdAt", ">=", since)
      .count()
      .get();

    return res.json({
      userCount: usersSnap.data().count,
      sessionCount: sessionsSnap.data().count,
      txCount: txSnap.data().count,
      recentSessions: recentSnap.data().count,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── System Health ─────────────────────────────────────────────────────────────

router.get("/admin/system-health", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ status: "unavailable", reason: "Firebase not configured" });

  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userCount, sessionCount, txCount,
      recentSessions, feedbackCount,
    ] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("sessions").count().get(),
      db.collection("credit_transactions").count().get(),
      db.collection("sessions").where("createdAt", ">=", last24h).count().get(),
      db.collection("feedback").where("createdAt", ">=", last7d).count().get(),
    ]);

    // Include resumed sessions in the same activity window as their failures.
    // Count each session once, even when it has several failed attempts.
    let errorCount7d: number | null = null;
    let sessionCount7d: number | null = null;
    try {
      const [errors, active] = await Promise.all([
        db.collection("sessions").where("lastRunErrorAt", ">=", last7d).count().get(),
        db.collection("sessions").where("updatedAt", ">=", last7d).count().get(),
      ]);
      errorCount7d = errors.data().count;
      sessionCount7d = active.data().count;
    } catch {
      // Unknown is never represented as zero or a healthy result.
    }

    return res.json({
      status: errorCount7d === null ? "degraded" : "ok",
      serverTime: new Date().toISOString(),
      collections: {
        users: userCount.data().count,
        sessions: sessionCount.data().count,
        credit_transactions: txCount.data().count,
      },
      last24h: {
        newSessions: recentSessions.data().count,
      },
      last7d: {
        errorSessions: errorCount7d,
        feedbackEntries: feedbackCount.data().count,
        activeSessions: sessionCount7d,
        errorRate: errorCount7d !== null && sessionCount7d !== null && sessionCount7d > 0
          ? ((errorCount7d / sessionCount7d) * 100).toFixed(1)
          : null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "User service unavailable" });

  const search = (req.query["search"] as string | undefined)?.toLowerCase();
  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = req.query["cursor"] as string | undefined;

  try {
    if (search) {
      // Walk the same stable ordering on each page. Search all accounts, including
      // old accounts and mixed-case emails, without a hidden recent-account cap.
      const users: Record<string, unknown>[] = [];
      let after = cursor;
      let exhausted = false;
      while (users.length <= limit && !exhausted) {
        let query = db.collection("users").orderBy(FieldPath.documentId()).limit(500);
        if (after) query = query.startAfter(after);
        const batch = await query.get();
        exhausted = batch.size < 500;
        for (const doc of batch.docs) {
          const user = serializeDoc(doc);
          if ([user.email, user.displayName].some(value => typeof value === "string" && value.toLowerCase().includes(search))) {
            users.push(user);
            if (users.length > limit) break;
          }
        }
        after = batch.docs.at(-1)?.id;
      }
      const hasMore = users.length > limit;
      const page = users.slice(0, limit);
      return res.json({users: page, hasMore, nextCursor: hasMore ? page.at(-1)?.id : null});
    }
    let q: FirebaseFirestore.Query = db.collection("users").orderBy("createdAt", "desc").limit(limit + 1);
    if (cursor) {
      const cursorDoc = await db.collection("users").doc(cursor).get();
      if (!cursorDoc.exists) return res.status(400).json({error: "This page has changed. Refresh the list."});
      q = q.startAfter(cursorDoc);
    }
    const snap = await q.get();
    const hasMore = snap.size > limit;
    const users = snap.docs.slice(0, limit).map(serializeDoc);
    return res.json({users, hasMore, nextCursor: hasMore ? users.at(-1)?.id : null});
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.get("/admin/users/:uid", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(404).json({ error: "Not found" });

  try {
    const [userDoc, txSnap, sessionsSnap] = await Promise.all([
      db.collection("users").doc(req.params["uid"]!).get(),
      db
        .collection("credit_transactions")
        .where("userId", "==", req.params["uid"]!)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      db
        .collection("sessions")
        .where("userId", "==", req.params["uid"]!)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get(),
    ]);

    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    return res.json({
      user: serializeDoc(userDoc),
      recentTransactions: txSnap.docs.map((d) => serializeDoc(d)),
      recentSessions: sessionsSnap.docs.map((d) => serializeDoc(d)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.post("/admin/users/:uid/credits", requireAdmin, async (req: any, res) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount === 0) {
    return res.status(400).json({ error: "amount (number) is required" });
  }

  try {
    const result = await addCredits(req.params["uid"]!, amount, "admin_adjustment", {
      source: reason ?? `admin_adjustment_by_${req.adminUid as string}`,
    });
    if (!result) return res.status(503).json({ error: "Firebase not configured" });
    return res.json({ success: true, newBalance: result.newBalance });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/users/:uid/ban
 * Body: { banned: boolean, reason?: string }
 * Sets Firestore flag, disables the Firebase Auth account, and (on ban) revokes
 * all existing refresh tokens so already-signed-in sessions are invalidated
 * immediately rather than coasting until natural token expiry (~1 hour).
 * Returns authWarning if the Firebase Auth update fails (Firestore flag was still set).
 */
router.post("/admin/users/:uid/ban", requireAdmin, async (req: any, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { banned, reason } = req.body as { banned?: boolean; reason?: string };
  if (typeof banned !== "boolean") {
    return res.status(400).json({ error: "banned (boolean) is required" });
  }

  try {
    await db
      .collection("users")
      .doc(req.params["uid"]!)
      .set(
        {
          banned,
          bannedReason: reason ?? null,
          bannedAt: banned ? FieldValue.serverTimestamp() : null,
          bannedBy: req.adminUid as string,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    let authWarning: string | null = null;
    try {
      await getAuth().updateUser(req.params["uid"]!, { disabled: banned });
      // Revoke all existing refresh tokens on ban so already-signed-in sessions
      // are rejected immediately. Not needed on unban — the user will sign in
      // fresh once their account is re-enabled.
      if (banned) {
        await getAuth().revokeRefreshTokens(req.params["uid"]!);
      }
    } catch (authErr: any) {
      authWarning = `Firestore flag was set, but Firebase Auth account update failed: ${authErr.message}. The user can still sign in.`;
    }

    // Send suspension email (fire-and-forget, non-fatal)
    if (banned && isResendConfigured()) {
      sendAccountSuspendedEmail(req.params["uid"]!, reason)
        .catch((e) => console.error("[admin] Account-suspended email failed (non-fatal):", e));
    }

    return res.json({
      success: true,
      banned,
      ...(authWarning ? { authWarning } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/users/:uid/test-model
 * Body: { provider: string, model: string } to enable, or {} to clear.
 * Sets testProvider + testModel on the user's Firestore doc. The frontend
 * reads these fields and forces all seat assignments to that model.
 */
router.post("/admin/users/:uid/test-model", requireAdmin, async (req: any, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { provider, model } = req.body as { provider?: string; model?: string };

  try {
    if (provider && model) {
      await db.collection("users").doc(req.params["uid"]!).set(
        { testProvider: provider, testModel: model, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return res.json({ success: true, testProvider: provider, testModel: model });
    } else {
      await db.collection("users").doc(req.params["uid"]!).set(
        { testProvider: FieldValue.delete(), testModel: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return res.json({ success: true, testProvider: null, testModel: null });
    }
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/send-reengagement
 * Triggers the re-engagement email campaign for users inactive for ≥ N days.
 * Manually triggered by the owner. Defaults to 14 days of inactivity.
 */
router.post("/admin/send-reengagement", requireAdmin, async (req: any, res) => {
  const inactiveDays = req.body?.inactiveDays ?? 14;
  if (!Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 365) return res.status(400).json({error: "Choose 1–365 inactive days"});
  try {
    const result = await runReengagementCampaign(inactiveDays);
    return res.json({ success: true, emailsSent: result.sent, failed: result.failed, skipped: result.skipped, inactiveDays });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.get("/admin/email-deliveries", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Email history unavailable"});
  try {
    const records = await db.collection("email_deliveries").orderBy("updatedAt", "desc").limit(25).get();
    return res.json({deliveries: records.docs.map(doc => {
      const data = doc.data();
      return {id: doc.id, userId: data.userId, templateId: data.templateId, status: data.status, updatedAt: data.updatedAt};
    })});
  } catch { return res.status(503).json({error: "Email history unavailable"}); }
});

// ── Email template management ─────────────────────────────────────────────────

/**
 * GET /admin/email-templates
 * Returns all 11 template IDs with their metadata + current active config.
 */
router.get("/admin/email-templates", requireAdmin, async (_req, res) => {
  try {
    const configs = await Promise.all(
      EMAIL_TEMPLATE_IDS.map(async (id) => {
        const config = await getTemplateConfig(id);
        const meta = EMAIL_TEMPLATE_META[id];
        return {
          id,
          label: meta.label,
          trigger: meta.trigger,
          tokens: meta.tokens,
          canDisable: meta.canDisable,
          defaultSubject: meta.defaultSubject,
          defaultHeadline: meta.defaultHeadline,
          defaultIntroText: meta.defaultIntroText,
          enabled: config.enabled,
          subject: config.subject,
          headline: config.headline,
          introText: config.introText,
          updatedAt: config.updatedAt,
          updatedBy: config.updatedBy,
        };
      })
    );
    return res.json({ templates: configs });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/email-templates/:id
 * Update the active config for a template (subject, headline, introText, enabled).
 */
router.patch("/admin/email-templates/:id", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  const { enabled, subject, headline, introText } = req.body as {
    enabled?: unknown; subject?: unknown; headline?: unknown; introText?: unknown;
  };

  // Runtime bounds — admin-only doesn't eliminate the risk of malformed or
  // oversized documents breaking email rendering downstream.
  const MAX_SUBJECT   = 200;
  const MAX_HEADLINE  = 200;
  const MAX_INTRO     = 3000;

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  if (subject !== undefined) {
    if (typeof subject !== "string" || subject.length > MAX_SUBJECT) {
      return res.status(400).json({ error: `subject must be a string under ${MAX_SUBJECT} characters` });
    }
  }
  if (headline !== undefined) {
    if (typeof headline !== "string" || headline.length > MAX_HEADLINE) {
      return res.status(400).json({ error: `headline must be a string under ${MAX_HEADLINE} characters` });
    }
  }
  if (introText !== undefined) {
    if (typeof introText !== "string" || introText.length > MAX_INTRO) {
      return res.status(400).json({ error: `introText must be a string under ${MAX_INTRO} characters` });
    }
  }

  try { validateTemplateContent(id, { subject: subject as string | undefined, headline: headline as string | undefined, introText: introText as string | undefined }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  if (enabled === false && !EMAIL_TEMPLATE_META[id].canDisable) return res.status(400).json({ error: "This account email cannot be disabled" });
  try {
    await saveTemplateConfig(
      id,
      {
        ...(enabled !== undefined ? { enabled: enabled as boolean } : {}),
        ...(subject !== undefined ? { subject: subject as string } : {}),
        ...(headline !== undefined ? { headline: headline as string } : {}),
        ...(introText !== undefined ? { introText: introText as string } : {}),
      },
      req.adminUid as string
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * GET /admin/email-templates/:id/preview
 * Returns the rendered HTML for the template using sample data.
 * Accepts optional query params: subject, headline, introText for live preview.
 */
router.get("/admin/email-templates/:id/preview", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  const { subject, headline, introText } = req.query as { subject?: string; headline?: string; introText?: string };
  try { validateTemplateContent(id, { subject, headline, introText }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  try {
    const html = await renderTemplatePreview(id, { subject, headline, introText });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    return res.send(html);
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * GET /admin/email-templates/:id/versions
 * List all saved versions for a template (newest first, max 20).
 */
router.get("/admin/email-templates/:id/versions", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  try {
    const versions = await listTemplateVersions(id);
    return res.json({ versions });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/email-templates/:id/versions
 * Save the current active config as a named version snapshot.
 * Body: { versionName: string }
 */
router.post("/admin/email-templates/:id/versions", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  const { versionName, draft } = req.body;
  if (typeof versionName !== "string" || !versionName.trim() || versionName.length > 100) {
    return res.status(400).json({ error: "versionName is required" });
  }
  if (draft !== undefined) {
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return res.status(400).json({ error: "Invalid email draft" });
    try { validateTemplateContent(id, draft); }
    catch (error: any) { return res.status(400).json({ error: error.message }); }
  }
  try {
    const versionId = await saveTemplateVersion(id, versionName.trim(), req.adminUid as string, draft);
    return res.json({ success: true, versionId });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/email-templates/:id/versions/:versionId/activate
 * Copy the version's content into the active template config.
 */
router.post(
  "/admin/email-templates/:id/versions/:versionId/activate",
  requireAdmin,
  async (req: any, res) => {
    const { id, versionId } = req.params as { id: EmailTemplateId; versionId: string };
    if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
      return res.status(400).json({ error: "Unknown template ID" });
    }
    try {
      await activateTemplateVersion(id, versionId, req.adminUid as string);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(err.message === "Version not found" ? 404 : 500).json({ error: safeError(err) });
    }
  }
);

/**
 * DELETE /admin/email-templates/:id/versions/:versionId
 */
router.delete(
  "/admin/email-templates/:id/versions/:versionId",
  requireAdmin,
  async (req: any, res) => {
    const { id, versionId } = req.params as { id: EmailTemplateId; versionId: string };
    if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
      return res.status(400).json({ error: "Unknown template ID" });
    }
    try {
      await deleteTemplateVersion(id, versionId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: safeError(err) });
    }
  }
);

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get("/admin/sessions", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Session service unavailable"});

  const limit = Math.min(Number(req.query["limit"]) || 20, 100);
  const cursor = req.query["cursor"] as string | undefined;
  const userId = req.query["userId"] as string | undefined;
  const templateId = req.query["templateId"] as string | undefined;
  const status = req.query["status"] as string | undefined;

  try {
    let q = db
      .collection("sessions")
      .orderBy("createdAt", "desc")
      .limit(limit + 1) as any;
    if (userId) q = q.where("userId", "==", userId);
    if (templateId) q = q.where("templateId", "==", templateId);
    if (status) q = q.where("status", "==", status);
    if (cursor) {
      const cursorDoc = await db.collection("sessions").doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    return res.json({
      sessions: docs.map((d: any) => serializeDoc(d)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.get("/admin/sessions/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(404).json({ error: "Not found" });

  try {
    const doc = await db.collection("sessions").doc(req.params["id"]!).get();
    if (!doc.exists) return res.status(404).json({ error: "Session not found" });

    const data = serializeDoc(doc);
    const turnsSnap = await doc.ref.collection("session_turns").orderBy("turnIndex").get();
    const turns = turnsSnap.docs.map((t) => serializeDoc(t));

    return res.json({ session: data, turns });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

router.get("/admin/transactions", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Transaction service unavailable"});

  const limit = Math.min(Number(req.query["limit"]) || 30, 100);
  const cursor = req.query["cursor"] as string | undefined;
  const userId = req.query["userId"] as string | undefined;
  const type = req.query["type"] as string | undefined;

  try {
    let q = db
      .collection("credit_transactions")
      .orderBy("createdAt", "desc")
      .limit(limit + 1) as any;
    if (userId) q = q.where("userId", "==", userId);
    if (type) q = q.where("type", "==", type);
    if (cursor) {
      const cursorDoc = await db.collection("credit_transactions").doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    return res.json({
      transactions: docs.map((d: any) => serializeDoc(d)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.post("/admin/credits/refund", requireAdmin, async (req: any, res) => {
  const { userId, amount, reason, transactionId, requestId } = req.body ?? {};
  if (typeof userId !== "string" || !userId || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 ||
      typeof transactionId !== "string" || !/^[^/]{1,200}$/.test(transactionId) ||
      typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(requestId) ||
      (reason !== undefined && typeof reason !== "string")) {
    return res.status(400).json({ error: "A charge, request ID and positive whole-credit amount are required." });
  }
  try {
    const result = await addCredits(userId, amount, "refund", {
      source: reason || `admin_refund_by_${req.adminUid}`,
      refundTransactionId: transactionId,
      idempotencyKey: `admin_refund_${req.adminUid}_${requestId}`,
    });
    if (!result) return res.status(503).json({ error: "Firebase not configured" });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(err instanceof InvalidRefundError ? 400 : 500).json({ error: err instanceof InvalidRefundError ? err.message : safeError(err) });
  }
});

// ── API Usage ─────────────────────────────────────────────────────────────────

router.get("/admin/api-usage", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Usage data is unavailable" });
  const through = new Date();
  const since = new Date(through.getTime() - 30 * 24 * 60 * 60 * 1000);
  const limit = 1000;
  try {
    // Read the same per-call cost snapshots and settled credits saved by brain.ts.
    // Projection avoids loading questions, transcripts or other session content.
    const snap = await db.collection("sessions")
      .where("createdAt", ">=", since).where("createdAt", "<=", through)
      .orderBy("createdAt", "desc")
      .select("createdAt", "creditsUsed", "callUsage", "status")
      .limit(limit + 1).get();
    return res.json({
      ...summarizeApiUsage(snap.docs.slice(0, limit).map(doc => doc.data())),
      apiLogs: [], // Compatibility for open tabs running the previous frontend.
      since: since.toISOString(), through: through.toISOString(),
      truncated: snap.size > limit, limit,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Error Logs ────────────────────────────────────────────────────────────────

router.get("/admin/error-logs", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Error records are unavailable" });

  const limit = Math.max(1, Math.min(Math.floor(Number(req.query["limit"])) || 50, 200));

  try {
    // Preserve historical API error records. Current execution failures are
    // written to the session marker below. Read failures must not look empty.
    const logsSnap = await db.collection("api_logs")
      .where("status", "==", "error").orderBy("createdAt", "desc")
      .limit(limit + 1).get();
    const logs = logsSnap.docs.slice(0, limit).map(d => serializeDoc(d));

    // The same failure marker used by System Health, including failed resumes.
    const failedSnap = await db
      .collection("sessions")
      .orderBy("lastRunErrorAt", "desc")
      .select("lastRunErrorAt", "lastRunErrorMessage", "title", "userId", "status")
      .limit(limit + 1)
      .get();

    return res.json({
      logs,
      hasMore: logsSnap.size > limit || failedSnap.size > limit,
      failedSessions: failedSnap.docs.slice(0, limit).map((d) => ({
        ...serializeDoc(d),
        sessionId: d.id,
        message: d.data().lastRunErrorMessage,
        createdAt: d.data().lastRunErrorAt?.toDate?.()?.toISOString() ?? null,
        _type: "session_error",
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Abuse Flags ───────────────────────────────────────────────────────────────

router.get("/admin/abuse-flags", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Feedback records are unavailable" });

  const limit = Math.max(1, Math.min(Math.floor(Number(req.query["limit"])) || 50, 200));

  try {
    // Filter before limiting: positive feedback must not crowd out flags.
    const snap = await db.collection("feedback")
      .where("rating", "in", ["bad", "warn"])
      .orderBy("createdAt", "desc").limit(limit + 1).get();
    const flagDocs = snap.docs.slice(0, limit);
    return res.json({
      flags: flagDocs.map(d => serializeDoc(d)),
      totalCount: flagDocs.length,
      hasMore: snap.size > limit,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Feature Flags (public read, admin write) ──────────────────────────────────

const DEFAULT_FLAGS: Record<string, boolean> = {};

router.get("/feature-flags", async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.json({ flags: DEFAULT_FLAGS });

  try {
    const doc = await db.collection("config").doc("featureFlags").get();
    if (!doc.exists) return res.json({ flags: DEFAULT_FLAGS });
    const saved = doc.data() ?? {};
    const flags: Record<string, boolean|string> = {...DEFAULT_FLAGS};
    for (const name of Object.keys(DEFAULT_FLAGS)) {
      if (typeof saved[name] === "boolean") flags[name] = saved[name];
      if (["all", "pro", "free"].includes(saved[`${name}_scope`])) flags[`${name}_scope`] = saved[`${name}_scope`];
    }
    return res.json({ flags });
  } catch {
    return res.status(503).json({error:"Feature flags are temporarily unavailable"});
  }
});

router.put("/admin/feature-flags/:name", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const name  = req.params["name"]!;
  const { value } = req.body as { value?: unknown };
  const validFlags  = Object.keys(DEFAULT_FLAGS);
  const VALID_SCOPES = new Set(["all", "pro", "free"]);

  if (name.endsWith("_scope")) {
    // Scope flags (e.g. "guestMode_scope") — value must be a valid plan scope string.
    const baseName = name.slice(0, -"_scope".length);
    if (!validFlags.includes(baseName)) {
      return res.status(400).json({
        error: `Unknown scope flag "${name}". Valid base flags: ${validFlags.join(", ")}`,
      });
    }
    if (typeof value !== "string" || !VALID_SCOPES.has(value)) {
      return res.status(400).json({
        error: `Scope value must be one of: ${[...VALID_SCOPES].join(", ")}`,
      });
    }
  } else {
    // Boolean feature flags — name must be in DEFAULT_FLAGS, value must be boolean.
    if (!validFlags.includes(name)) {
      return res.status(400).json({
        error: `Unknown flag "${name}". Valid flags: ${validFlags.join(", ")}`,
      });
    }
    if (typeof value !== "boolean") {
      return res.status(400).json({ error: "value must be a boolean (true or false)" });
    }
  }

  try {
    await db
      .collection("config")
      .doc("featureFlags")
      .set(
        { [name]: value, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    return res.json({ success: true, name, value });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Admin Limits (public read, admin write) ───────────────────────────────────
//
// The same saved limits govern public controls, estimates and session runs.
router.get("/limits", async (_req, res) => {
  try { return res.json({ limits: await getAdminLimits() }); }
  catch { return res.status(503).json({error:"Platform limits are temporarily unavailable"}); }
});

router.put("/admin/limits/:name", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const name  = req.params["name"]!;
  const { value } = req.body as { value?: unknown };

  if (!(name in DEFAULT_LIMITS)) {
    return res.status(400).json({
      error: `Unknown limit "${name}". Valid limits: ${Object.keys(DEFAULT_LIMITS).join(", ")}`,
    });
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return res.status(400).json({ error: "value must be an integer" });
  }
  const range = LIMIT_RANGES[name]!;
  if (value < range.min || value > range.max) {
    return res.status(400).json({
      error: `${name} must be between ${range.min} and ${range.max}`,
    });
  }

  try {
    await db
      .collection("config")
      .doc("adminLimits")
      .set({ [name]: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ success: true, name, value });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Credit Packs ─────────────────────────────────────────────────────────────

/**
 * GET /admin/credit-packs
 * Returns every pack — active and deactivated — for the admin list view.
 * GET /billing/products (the public/customer-facing route) should call
 * getActiveCreditPacks() instead, which filters to active: true only.
 */
router.get("/admin/credit-packs", requireAdmin, async (_req, res) => {
  try {
    const packs = await getAllCreditPacks();
    return res.json({ packs: Object.values(packs), bounds: CREDIT_PACK_BOUNDS });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/credit-packs
 * Creates a new pack. id and the nested price id are supplied here and are
 * permanent from this point on — see the immutability rule documented in
 * creditPacksConfig.ts. Fails with 409 if the id is already in use.
 */
router.post("/admin/credit-packs", requireAdmin, async (req: any, res) => {
  const { id, name, description, unitAmountCents, creditAmount } = req.body as {
    id?: string;
    name?: string;
    description?: string;
    unitAmountCents?: number;
    creditAmount?: number;
  };

  if (!id || typeof id !== "string" || !/^[a-z0-9_]+$/.test(id)) {
    return res.status(400).json({ error: "id is required and must be lowercase letters, numbers, and underscores only" });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (
    typeof unitAmountCents !== "number" ||
    unitAmountCents < CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS ||
    unitAmountCents > CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS
  ) {
    return res.status(400).json({
      error: `unitAmountCents must be a number between ${CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS} and ${CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS}`,
    });
  }
  if (
    typeof creditAmount !== "number" ||
    !Number.isInteger(creditAmount) ||
    creditAmount < CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT ||
    creditAmount > CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT
  ) {
    return res.status(400).json({
      error: `creditAmount must be a whole number between ${CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT} and ${CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT}`,
    });
  }

  try {
    await createCreditPack({
      id,
      name: name.trim(),
      description: description?.trim() ?? "",
      active: true,
      metadata: { type: "credit_pack", creditAmount: String(creditAmount) },
      prices: [
        {
          id: `price_${id}`,
          product: id,
          unit_amount: unitAmountCents,
          currency: "usd",
          recurring: null,
          active: true,
          metadata: { creditAmount: String(creditAmount) },
        },
      ],
    });
    return res.json({ success: true, id });
  } catch (err: any) {
    const status = /already exists/i.test(err.message) ? 409 : 500;
    return res.status(status).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/credit-packs/:id
 * Edits name/description/active/price/creditAmount on an existing pack.
 * id itself is taken only from the URL param, never from the body.
 */
router.patch("/admin/credit-packs/:id", requireAdmin, async (req: any, res) => {
  const { id } = req.params as { id: string };
  const { name, description, active, unitAmountCents, creditAmount } = req.body as {
    name?: string;
    description?: string;
    active?: boolean;
    unitAmountCents?: number;
    creditAmount?: number;
  };

  if (unitAmountCents !== undefined) {
    if (
      typeof unitAmountCents !== "number" ||
      unitAmountCents < CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS ||
      unitAmountCents > CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS
    ) {
      return res.status(400).json({
        error: `unitAmountCents must be a number between ${CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS} and ${CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS}`,
      });
    }
  }
  if (creditAmount !== undefined) {
    if (
      typeof creditAmount !== "number" ||
      !Number.isInteger(creditAmount) ||
      creditAmount < CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT ||
      creditAmount > CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT
    ) {
      return res.status(400).json({
        error: `creditAmount must be a whole number between ${CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT} and ${CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT}`,
      });
    }
  }
  if (active !== undefined && typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be a boolean" });
  }

  try {
    const pack = await updateCreditPack(id, {
      name: name?.trim(),
      description: description?.trim(),
      active,
      unitAmountCents,
      creditAmount,
    });
    return res.json({ success: true, pack });
  } catch (err: any) {
    const status = /no pack with id/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ error: safeError(err) });
  }
});

/**
 * DELETE /admin/credit-packs/:id
 * Soft-delete only — sets active: false. No hard-delete endpoint exists.
 * Reactivate via PATCH .../:id with { active: true }.
 */
router.delete("/admin/credit-packs/:id", requireAdmin, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    await deactivateCreditPack(id);
    return res.json({ success: true, id, active: false });
  } catch (err: any) {
    const status = /no pack with id/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ error: safeError(err) });
  }
});

// ── Canon / Conscience Config ─────────────────────────────────────────────────

/**
 * GET /admin/conscience
 * Returns the current conscience clause stored in Firestore, or the Canon v2
 * fallback if the document doesn't exist yet.
 */
router.get("/admin/conscience", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  try {
    const doc = await db.collection("system_config").doc("conscience").get();

    if (!doc.exists) {
      return res.json({
        exists: false,
        version: CANON_V2_FALLBACK_VERSION,
        text: CANON_V2_FALLBACK_TEXT,
        updatedAt: null,
        updatedBy: null,
        note: "No Firestore document found — Canon v2 fallback is in use.",
      });
    }

    return res.json({ exists: true, ...serializeDoc(doc) });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/conscience
 * Body: { text: string, version?: string }
 * Writes a new conscience clause to Firestore and invalidates the local cache.
 * All new sessions on this instance will pick up the new text immediately;
 * other Cloud Run instances will pick it up within 5 minutes (TTL window).
 */
router.patch("/admin/conscience", requireAdmin, async (req: any, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { text, version } = req.body as { text?: string; version?: string };

  if (!text?.trim()) {
    return res.status(400).json({ error: "text (string) is required and must not be empty" });
  }

  const newVersion = version?.trim() || `v-${new Date().toISOString().slice(0, 10)}`;

  try {
    await db.collection("system_config").doc("conscience").set({
      text: text.trim(),
      version: newVersion,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.adminUid as string,
    });

    // Invalidate this instance's cache immediately
    invalidateConscienceCache();

    return res.json({
      success: true,
      version: newVersion,
      note: "This instance cache cleared. Other Cloud Run instances update within 5 minutes.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Templates ─────────────────────────────────────────────────────────────────

router.get("/admin/templates", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Template service unavailable"});

  try {
    return res.json({ templates: await getTemplates(true) });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.put("/admin/templates/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { title, description, isActive, systemPrompt, defaultSettings } = req.body as {
    title?: string;
    description?: string;
    isActive?: boolean;
    systemPrompt?: string;
    defaultSettings?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.length > 200) return res.status(400).json({error: "Enter a title of 1–200 characters"});
    updates["title"] = title.trim();
  }
  if (description !== undefined) {
    if (typeof description !== "string" || description.length > 2000) return res.status(400).json({error: "Description must be at most 2,000 characters"});
    updates["description"] = description;
  }
  if (typeof isActive === "boolean") updates["isActive"] = isActive;
  if (systemPrompt !== undefined) {
    if (typeof systemPrompt !== "string") return res.status(400).json({ error: "Invalid template instructions" });
    updates["systemPrompt"] = systemPrompt.trim() ? systemPrompt : FieldValue.delete();
  }
  if (req.body.inputFields !== undefined) {
    const fields = TemplateInputFieldsSchema.safeParse(req.body.inputFields);
    if (!fields.success) return res.status(400).json({error: "Questions need unique IDs, labels, valid types and required/optional settings (maximum 30)."});
    updates["inputFields"] = fields.data;
  }
  if (defaultSettings || req.body.defaultConfig) {
    const config = CourtConfigFieldsSchema.partial().safeParse(req.body.defaultConfig ?? defaultSettings);
    if (!config.success) return res.status(400).json({error:"Invalid template settings"});
    updates["defaultConfig"] = config.data;
    updates["defaultSettings"] = FieldValue.delete();
  }

  try {
    await db.collection("templates").doc(req.params["id"]!).set(updates, { merge: true });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Pricing / Multiplier Config ───────────────────────────────────────────────

router.get("/admin/pricing", requireAdmin, async (_req, res) => {
  try {
    const table = await getAdminPricingTable(true);
    return res.json(table);
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.put("/admin/pricing/:model", requireAdmin, async (req, res) => {
  const { model } = req.params as { model: string };
  const parsed = MultiplierSchema.safeParse(req.body?.multiplier);
  if (!parsed.success) {
    return res.status(400).json({ error: "multiplier must be a number between 1 and 100" });
  }
  const value = parsed.data;

  try {
    const registry = await getModelRegistry();
    if (!registry.providers.some(p => p.models.some(m => m.id === model))) return res.status(404).json({error:"Unknown model"});
    await saveMultiplierOverride(model, value);
    return res.json({ success: true, model, multiplier: value });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

router.delete("/admin/pricing/:model", requireAdmin, async (req, res) => {
  const { model } = req.params as { model: string };
  try {
    const registry = await getModelRegistry();
    if (!registry.providers.some(p => p.models.some(m => m.id === model))) return res.status(404).json({error:"Unknown model"});
    await resetMultiplierToDefault(model);
    return res.json({ success: true, model, reset: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── API Key Management ────────────────────────────────────────────────────────

/** GET /admin/api-keys — list all configured providers (masked keys only) */
router.get("/admin/api-keys", requireAdmin, async (_req, res) => {
  try {
    const providers = await getAllConfiguredProviders();
    return res.json({ providers });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/** PUT /admin/api-keys/:providerId — save or update a provider's API key */
router.put("/admin/api-keys/:providerId", requireAdmin, async (req, res) => {
  const { providerId } = req.params as { providerId: string };
  const { key, label, baseUrl } = req.body as {
    key?: string;
    label?: string;
    baseUrl?: string;
  };

  if (!key || typeof key !== "string" || key.trim().length < 8) {
    return res.status(400).json({ error: "key must be a non-empty string (min 8 chars)" });
  }
  if (!label || typeof label !== "string" || label.trim().length === 0) {
    return res.status(400).json({ error: "label is required" });
  }

  const sanitizedId = providerId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  try {
    await saveApiKey(sanitizedId, key.trim(), label.trim(), baseUrl?.trim() || undefined);
    return res.json({ success: true, providerId: sanitizedId });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/** DELETE /admin/api-keys/:providerId — remove Firestore override (env var fallback still applies) */
router.delete("/admin/api-keys/:providerId", requireAdmin, async (req, res) => {
  const { providerId } = req.params as { providerId: string };
  try {
    await deleteApiKey(providerId);
    return res.json({ success: true, providerId, note: "env var fallback still applies if set" });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

// ── Seat Briefs ───────────────────────────────────────────────────────────────

/**
 * GET /admin/seat-briefs
 * Returns all seat briefs — active (Firestore override or file fallback) plus
 * the factory-default file text for comparison.
 */
router.get("/admin/seat-briefs", requireAdmin, async (_req, res) => {
  try {
    return res.json(await getSeatBriefsConfig());
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/seat-briefs/:seatId
 * Body: { text: string }
 * Writes an override for a single seat brief to Firestore.
 */
router.patch("/admin/seat-briefs/:seatId", requireAdmin, async (req: any, res) => {
  const { seatId } = req.params as { seatId: string };
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  if (!SEAT_IDS.includes(seatId as SeatId)) {
    return res.status(400).json({
      error: `Invalid seatId. Must be one of: ${SEAT_IDS.join(", ")}`,
    });
  }

  const { text } = req.body as { text?: string };
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text (string) is required and must not be empty" });
  }

  try {
    await db.collection("system_config").doc("seat_briefs").set(
      {
        [seatId]: text.trim(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.adminUid as string,
      },
      { merge: true }
    );

    return res.json({ success: true, seatId, length: text.trim().length });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * DELETE /admin/seat-briefs/:seatId
 * Removes the Firestore override for a seat — reverts to the file default.
 */
router.delete("/admin/seat-briefs/:seatId", requireAdmin, async (req: any, res) => {
  const { seatId } = req.params as { seatId: string };
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  if (!SEAT_IDS.includes(seatId as SeatId)) {
    return res.status(400).json({ error: `Invalid seatId` });
  }

  try {
    await db.collection("system_config").doc("seat_briefs").set(
      { [seatId]: FieldValue.delete() },
      { merge: true }
    );

    return res.json({
      success: true,
      seatId,
      note: "Firestore override removed — file default is now active",
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * GET /admin/billing-defaults
 * Returns the admin-configurable billing defaults.
 */
router.get("/admin/billing-defaults", requireAdmin, async (_req: any, res) => {
  const defaults = await getBillingDefaults();
  return res.json(defaults);
});

/**
 * PUT /admin/billing-defaults
 * Updates the billing defaults stored in Firestore config/billingDefaults.
 */
router.put("/admin/billing-defaults", requireAdmin, async (req: any, res) => {
  const { autoRefillAmounts, defaultAutoRefillAmount, defaultThresholdCredits, defaultWarningThresholdCredits, signupBonusCredits, emailCreditWarningThreshold } = req.body as {
    autoRefillAmounts?: number[];
    defaultAutoRefillAmount?: number;
    defaultThresholdCredits?: number;
    defaultWarningThresholdCredits?: number;
    signupBonusCredits?: number;
    emailCreditWarningThreshold?: number;
  };

  try {
    const updated = await saveBillingDefaults({
      ...(autoRefillAmounts !== undefined && { autoRefillAmounts }),
      ...(defaultAutoRefillAmount !== undefined && { defaultAutoRefillAmount }),
      ...(defaultThresholdCredits !== undefined && { defaultThresholdCredits }),
      ...(defaultWarningThresholdCredits !== undefined && { defaultWarningThresholdCredits }),
      ...(signupBonusCredits !== undefined && { signupBonusCredits }),
      ...(emailCreditWarningThreshold !== undefined && { emailCreditWarningThreshold }),
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(err instanceof InvalidBillingDefaultsError ? 400 : 500).json({ error: err instanceof InvalidBillingDefaultsError ? err.message : safeError(err) });
  }
});

// Master power changes only this flag; individual selections remain intact.
router.patch("/admin/ai-studio/power", requireAdmin, async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    await db.collection("system_config").doc("aiStudio").set(
      { aiEnabled: enabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true },
    );
    return res.json({ aiEnabled: enabled });
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/** Returns all known models, their prices, and the saved master power state. */
router.get("/admin/ai-studio/models", requireAdmin, async (_req, res) => {
  try {
    return res.json(await getAiStudioModels());
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/ai-studio/models/:modelId
 * Enable or disable an individual model.
 */
router.patch("/admin/ai-studio/models/:modelId", requireAdmin, async (req: any, res) => {
  const modelId = req.params["modelId"] as string;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let disabledModels: string[] = (snap.data()?.["disabledModels"] as string[]) ?? [];
      if (enabled) disabledModels = disabledModels.filter((m) => m !== modelId);
      else if (!disabledModels.includes(modelId)) disabledModels.push(modelId);
      tx.set(ref, { disabledModels, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return res.json({ ok: true, modelId, enabled });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/ai-studio/providers/:providerId
 * Enable or disable an entire provider (all its models hidden/shown).
 */
router.patch("/admin/ai-studio/providers/:providerId", requireAdmin, async (req: any, res) => {
  const providerId = req.params["providerId"] as string;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let disabledProviders: string[] = (snap.data()?.["disabledProviders"] as string[]) ?? [];
      if (enabled) disabledProviders = disabledProviders.filter((p) => p !== providerId);
      else if (!disabledProviders.includes(providerId)) disabledProviders.push(providerId);
      tx.set(ref, { disabledProviders, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return res.json({ ok: true, providerId, enabled });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * POST /admin/ai-studio/providers
 * Add a new custom provider with its models.
 */
router.post("/admin/ai-studio/providers", requireAdmin, async (req: any, res) => {
  const parsed = CustomProviderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Valid provider ID, label, models, nonnegative rates and multipliers (1–100) are required"});
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const customProviders = [...(doc.data()?.customProviders ?? []), parsed.data];
      validateCustomProviders(customProviders);
      tx.set(ref, {customProviders, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    });
    return res.status(201).json({ok:true, id:parsed.data.id});
  } catch (err: any) {
    return res.status(err.message?.includes("already exists") ? 409 : 500).json({error:safeError(err)});
  }
});

/**
 * DELETE /admin/ai-studio/providers/:providerId
 * Remove a custom provider and all its models.
 */
router.delete("/admin/ai-studio/providers/:providerId", requireAdmin, async (req: any, res) => {
  const providerId = req.params["providerId"] as string;
  const BUILT_IN = Object.keys(PROVIDER_MODELS);
  if (BUILT_IN.includes(providerId)) {
    return res.status(400).json({ error: "Cannot delete a built-in provider. Disable it instead." });
  }
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const customProviders = ((doc.data()?.customProviders as CustomProviderDefinition[]) ?? []).filter(cp => cp.id !== providerId);
      tx.set(ref, {customProviders, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    });
    return res.json({ ok: true, providerId });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * GET /admin/checklist
 * Returns the Setup Checklist items (agent + owner sections) merged with
 * their persisted checked state.
 */
router.get("/admin/checklist", requireAdmin, async (_req, res) => {
  try {
    const items = await getChecklist();
    return res.json({ items });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/checklist/:id
 * Toggles a single checklist item's checked state.
 */
router.patch("/admin/checklist/:id", requireAdmin, async (req: any, res) => {
  const { checked } = req.body as { checked?: boolean };
  if (typeof checked !== "boolean") {
    return res.status(400).json({ error: "checked must be a boolean" });
  }
  try {
    await setChecklistItemChecked(req.params.id, checked);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: safeError(err) });
  }
});

/**
 * GET /admin/model-scores
 * Returns quality scores for all known models (default + Firestore overrides).
 * Used by the Admin AI Studio tab to let admins calibrate the intelligence slider.
 */
router.get("/admin/model-scores", requireAdmin, async (_req, res) => {
  try {
    const registry = await getModelRegistry();
    const models = registry.providers.flatMap(p => p.models);
    return res.json({scores:Object.fromEntries(models.map(m => [m.id, m.qualityScore])),
      overrides:Object.fromEntries(models.filter(m => m.qualityScore !== m.defaultQualityScore).map(m => [m.id, m.qualityScore]))});
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

/**
 * PATCH /admin/model-scores/:modelId
 * Set a custom quality score (0–100) for a model. Stored in Firestore.
 * DELETE-equivalent: pass score: null to reset to default.
 */
router.patch("/admin/model-scores/:modelId", requireAdmin, async (req: any, res) => {
  const { modelId } = req.params;
  const { score } = req.body as { score?: number | null };
  if (score !== null && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100)) {
    return res.status(400).json({ error: "score must be a number between 0 and 100, or null to reset" });
  }
  try {
    const db = getFirestoreDb();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });
    const registry = await getModelRegistry();
    const model = registry.providers.flatMap(p => p.models).find(m => m.id === modelId);
    if (!model) return res.status(404).json({error:"Unknown model"});
    const ref = db.collection("system_config").doc("modelScores");
    if (score === null) {
      await ref.set({ [modelId]: FieldValue.delete() }, { merge: true });
    } else {
      await ref.set({ [modelId]: score, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return res.json({ ok: true, modelId, score: score ?? model.defaultQualityScore });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});

export default router;
