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

  try {
    // Check if user doc already exists (returning user, not a new signup)
    const existing = await userRef.get();

    if (!existing.exists) {
      // New user — create profile with neutral defaults (no credit balance set here;
      // grantSignupBonus writes it atomically via the credit ledger)
      await userRef.set({
        email: decoded.email ?? "",
        displayName: null,
        plan: "free",
        creditBalance: 0,
        subscriptionStatus: "none",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        defaultSettings: {
          courtMode: "adversarial",
          confidenceTarget: 85,
          responseMode: "balanced",
          outputFormat: "report",
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

export default router;
