import { Router } from "express";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";
import { safeError } from "../lib/safeError.js";

const router = Router();

/**
 * DELETE /account — server-side account teardown.
 *
 * Order of operations is deliberate:
 *   1. Verify the request is from the account owner.
 *   2. Delete all Firestore data (sessions, turns, transactions, logs, profile).
 *   3. Delete the Firebase Auth user last.
 *
 * Deleting Auth last means: if Firestore deletion fails, the user still has a
 * valid Auth account and can retry. If Auth deletion fails after Firestore is
 * gone, we log the orphaned UID for manual cleanup — the client is told to sign
 * out so the session cookie is cleared; the orphaned Auth account has no
 * associated data and cannot re-provision credits (profile missing →
 * provision re-creates it, but grantSignupBonus is idempotent and the
 * original bonus transaction was deleted with credit_transactions).
 *
 * Frontend (`Settings.tsx`) calls this and then signs the user out —
 * it does NOT call Firebase client-SDK deleteUser() separately, since that
 * operation is done here by the Admin SDK with no need for recent-login auth.
 */
router.delete("/account", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];
  if (!db || !authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const uid = decoded.uid;

  try {
    // ── 1. Firestore data ───────────────────────────────────────────────────

    // Sessions + session_turns subcollections
    const sessionsSnap = await db.collection("sessions").where("userId", "==", uid).get();
    await Promise.all(
      sessionsSnap.docs.map(async (sessionDoc) => {
        const turnsSnap = await sessionDoc.ref.collection("session_turns").get();
        await Promise.all(turnsSnap.docs.map((t) => t.ref.delete()));
        await sessionDoc.ref.delete();
      })
    );

    // Credit ledger — deleted for GDPR/right-to-erasure compliance.
    // Square's own payment records are outside our control.
    const txSnap = await db.collection("credit_transactions").where("userId", "==", uid).get();
    await Promise.all(txSnap.docs.map((d) => d.ref.delete()));

    // Feedback
    const feedbackSnap = await db.collection("feedback").where("userId", "==", uid).get();
    await Promise.all(feedbackSnap.docs.map((d) => d.ref.delete()));

    // API logs (non-fatal — collection may not exist)
    try {
      const logsSnap = await db.collection("api_logs").where("userId", "==", uid).get();
      await Promise.all(logsSnap.docs.map((d) => d.ref.delete()));
    } catch {
      // collection may not exist
    }

    // User profile — deleted last so auth context is still readable above
    await db.collection("users").doc(uid).delete();

    // ── 2. Firebase Auth user (Admin SDK — no recent-login requirement) ─────
    // Done after Firestore so a failure here leaves the account in a predictable
    // state: Firestore data gone, Auth account still exists. The client signs out
    // unconditionally (see Settings.tsx), so the session is cleared either way.
    // The orphaned Auth account has no Firestore profile — re-login would
    // trigger /auth/provision which re-creates a zero-credit profile, but the
    // original signup bonus was already recorded and grantSignupBonus is idempotent.
    let authDeleted = true;
    try {
      await getAuth().deleteUser(uid);
    } catch (authErr: any) {
      authDeleted = false;
      // auth/user-not-found is fine — already deleted (e.g. client SDK deleted it first)
      if (authErr?.code !== "auth/user-not-found") {
        console.error(`[account] Auth deletion failed for uid=${uid} — orphaned Auth account. Manual cleanup required.`, authErr?.message);
      }
    }

    res.json({ success: true, authDeleted });
  } catch (e: any) {
    console.error("[account] Delete account error:", e);
    res.status(500).json({ message: safeError(e) });
  }
});

export default router;
