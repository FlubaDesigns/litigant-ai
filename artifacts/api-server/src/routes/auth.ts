import { Router } from "express";
import { makeRateLimiter } from "../lib/rateLimiter.js";
import { verifyIdToken, isFirebaseConfigured, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { grantSignupBonus } from "../lib/creditLedger.js";
import { FieldValue } from "firebase-admin/firestore";
import { sendVerificationEmail, sendPasswordResetEmail, isResendConfigured } from "../lib/emailService.js";

const router = Router();

/**
 * 3 password-reset emails per hour per target address.
 * Keyed on the email from the request body so a caller can't flood one inbox
 * by rotating IPs — Firestore-backed so the limit is global across all instances.
 */
const resetByEmailLimiter = makeRateLimiter({
  keyFn: (req) => {
    const email = (req.body as { email?: string })?.email?.trim().toLowerCase();
    return `reset_email:${email ?? "unknown"}`;
  },
  limit: 3,
  windowMs: 60 * 60 * 1000,
  message: "Too many password reset requests for this address. Please try again in an hour.",
});

/**
 * 10 password-reset emails per 15 minutes per IP.
 * Catches distributed spraying across many target addresses from the same origin.
 */
const resetByIpLimiter = makeRateLimiter({
  keyFn: (req) => `reset_ip:${req.ip ?? "unknown"}`,
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "Too many password reset requests from this IP. Please try again later.",
});

/**
 * 10 verification emails per hour per IP.
 * The endpoint requires a valid Firebase token so blast radius is limited
 * to the authenticated user's own inbox.
 */
const verifyByIpLimiter = makeRateLimiter({
  keyFn: (req) => `verify_ip:${req.ip ?? "unknown"}`,
  limit: 10,
  windowMs: 60 * 60 * 1000,
  message: "Too many verification email requests. Please try again later.",
});

/**
 * POST /auth/provision
 *
 * Server-side equivalent of a Firebase Auth onCreate Cloud Function.
 * Called immediately after a user signs up or signs in for the first time.
 *
 * Atomically:
 *   1. Creates the user document in Firestore (if it does not already exist)
 *   2. Grants the 100-credit signup bonus (idempotent — fires at most once per user)
 *
 * The client never controls the credit amount or grant logic — this endpoint is
 * the sole authority for initial provisioning.
 */
router.post("/auth/provision", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isFirebaseConfigured()) {
    return res.json({ provisioned: false, reason: "firebase_not_configured" });
  }

  const db = getFirestoreDb();
  if (!db) {
    return res.json({ provisioned: false, reason: "firestore_unavailable" });
  }

  const uid = decoded.uid;
  const userRef = db.collection("users").doc(uid);

  // Optional profile fields sent by the client at signup
  const { role, organization } = (req.body ?? {}) as {
    role?: string;
    organization?: string;
  };

  // Whitelist accepted role values so arbitrary strings can't be stored
  const VALID_ROLES = new Set([
    "individual", "lawyer", "law-student",
    "researcher", "business", "journalist", "other",
  ]);
  const sanitizedRole    = role && VALID_ROLES.has(role) ? role : null;
  const sanitizedOrg     = organization?.trim().slice(0, 200) || null;

  try {
    // Check if user doc already exists (returning user, not a new signup)
    const existing = await userRef.get();

    if (!existing.exists) {
      // New user — create profile with neutral defaults (no credit balance set here;
      // grantSignupBonus writes it atomically via the credit ledger)
      await userRef.set({
        email:              decoded.email ?? "",
        displayName:        decoded.name ?? decoded.email?.split("@")[0] ?? null,
        role:               sanitizedRole,
        organization:       sanitizedOrg,
        plan:               "free",
        creditBalance:      0,
        subscriptionStatus: "none",
        createdAt:          FieldValue.serverTimestamp(),
        updatedAt:          FieldValue.serverTimestamp(),
        defaultSettings: {
          courtMode:         "adversarial",
          litigantCount:     3,
          confidenceTarget:  80,
          responseMode:      "balanced",
          outputFormat:      "report",
        },
      });
    }

    // Grant signup bonus — idempotent (at most once per user via idempotency key)
    const { skipped } = await grantSignupBonus(uid);

    return res.json({
      provisioned: true,
      newUser: !existing.exists,
      bonusGranted: !skipped,
    });
  } catch (err: any) {
    console.error("[Auth] provision error:", err.message);
    return res.status(500).json({ error: "Provisioning failed" });
  }
});

/**
 * PATCH /auth/preferences
 *
 * Saves the user's default session configuration and marks onboarding complete.
 * All fields are optional — only provided fields are updated.
 */
router.patch("/auth/preferences", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) return res.status(401).json({ error: "Unauthorized" });

  if (!isFirebaseConfigured()) return res.json({ saved: false, reason: "firebase_not_configured" });
  const db = getFirestoreDb();
  if (!db) return res.json({ saved: false, reason: "firestore_unavailable" });

  const VALID_COURT_MODES  = new Set(["adversarial", "socratic", "analysis", "critique"]);
  const VALID_RESP_MODES   = new Set(["balanced", "thorough", "concise"]);
  const VALID_OUT_FORMATS  = new Set(["report", "memo", "bullets", "verdict"]);
  const VALID_PROVIDERS    = new Set(["openai", "anthropic", "grok", "gemini"]);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const ds   = (body.defaultSettings ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (body.onboardingComplete === true) patch["onboardingComplete"] = true;

  if (ds.courtMode    && VALID_COURT_MODES.has(ds.courtMode as string))
    patch["defaultSettings.courtMode"]    = ds.courtMode;
  if (typeof ds.litigantCount === "number" && Number.isInteger(ds.litigantCount) && ds.litigantCount >= 2 && ds.litigantCount <= 10)
    patch["defaultSettings.litigantCount"] = ds.litigantCount;
  if (typeof ds.confidenceTarget === "number" && Number.isInteger(ds.confidenceTarget) && ds.confidenceTarget >= 50 && ds.confidenceTarget <= 99)
    patch["defaultSettings.confidenceTarget"] = ds.confidenceTarget;
  if (ds.responseMode && VALID_RESP_MODES.has(ds.responseMode as string))
    patch["defaultSettings.responseMode"] = ds.responseMode;
  if (ds.outputFormat && VALID_OUT_FORMATS.has(ds.outputFormat as string))
    patch["defaultSettings.outputFormat"] = ds.outputFormat;
  if (ds.provider     && VALID_PROVIDERS.has(ds.provider as string))
    patch["defaultSettings.provider"]     = ds.provider;

  try {
    await db.collection("users").doc(decoded.uid).update(patch);
    return res.json({ saved: true });
  } catch (err: any) {
    console.error("[Auth] preferences save error:", err.message);
    return res.status(500).json({ error: "Failed to save preferences" });
  }
});

/**
 * POST /auth/send-verification
 * Generates a Firebase email verification link and sends it via Resend.
 * Requires a valid Bearer token (the user must be signed in).
 */
router.post("/auth/send-verification", verifyByIpLimiter, async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) return res.status(401).json({ error: "Unauthorized" });

  if (!isResendConfigured()) {
    return res.status(503).json({ error: "Email service not configured" });
  }

  try {
    await sendVerificationEmail(decoded.uid);
    return res.json({ sent: true });
  } catch (err: any) {
    console.error("[Auth] send-verification error:", err.message);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
});

/**
 * POST /auth/send-password-reset
 * Generates a Firebase password reset link and sends it via Resend.
 * Body: { email: string }
 * Public endpoint — no auth required.
 */
router.post("/auth/send-password-reset", resetByEmailLimiter, resetByIpLimiter, async (req, res) => {
  const { email } = (req.body ?? {}) as { email?: string };
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }

  if (!isResendConfigured()) {
    return res.status(503).json({ error: "Email service not configured" });
  }

  try {
    await sendPasswordResetEmail(email.trim().toLowerCase());
  } catch (err: any) {
    // auth/user-not-found is swallowed silently — all errors return the same { sent: true }
    // below so callers cannot distinguish registered from unregistered addresses.
    // Every other error is still logged for ops visibility.
    if (err?.code !== "auth/user-not-found") {
      console.error("[Auth] send-password-reset error:", err.message);
    }
  }
  // Always return success — don't reveal whether the email exists
  return res.json({ sent: true });
});

export default router;
