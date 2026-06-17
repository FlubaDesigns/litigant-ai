import { Router } from "express";
import { verifyIdToken, isFirebaseConfigured, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { grantSignupBonus } from "../lib/creditLedger.js";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

/**
 * POST /auth/provision
 *
 * Server-side equivalent of a Firebase Auth onCreate Cloud Function.
 * Called immediately after a user signs up or signs in for the first time.
 *
 * Atomically:
 *   1. Creates the user document in Firestore (if it does not already exist)
 *   2. Grants the 50-credit signup bonus (idempotent — fires at most once per user)
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
  if (typeof ds.litigantCount === "number" && ds.litigantCount >= 2 && ds.litigantCount <= 10)
    patch["defaultSettings.litigantCount"] = ds.litigantCount;
  if (typeof ds.confidenceTarget === "number" && ds.confidenceTarget >= 50 && ds.confidenceTarget <= 99)
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

export default router;
