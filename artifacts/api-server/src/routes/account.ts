import { Router } from "express";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

/**
 * DELETE /account — delete all user data from Firestore (profile + sessions + session_turns +
 * credit_transactions + api_logs + feedback).
 * Client calls this BEFORE deleting the Firebase Auth user so we still have the auth context.
 *
 * Note: credit_transactions are deleted here for GDPR/right-to-erasure compliance.
 * Payment-event metadata is Firestore-only; Square's own records are outside our control.
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
    // 1. Delete all sessions + their session_turns subcollections
    const sessionsSnap = await db.collection("sessions").where("userId", "==", uid).get();
    await Promise.all(
      sessionsSnap.docs.map(async (sessionDoc) => {
        const turnsSnap = await sessionDoc.ref.collection("session_turns").get();
        await Promise.all(turnsSnap.docs.map((t) => t.ref.delete()));
        await sessionDoc.ref.delete();
      })
    );

    // 2. Delete credit_transactions (financial ledger entries)
    const txSnap = await db.collection("credit_transactions").where("userId", "==", uid).get();
    await Promise.all(txSnap.docs.map((d) => d.ref.delete()));

    // 3. Delete feedback docs
    const feedbackSnap = await db.collection("feedback").where("userId", "==", uid).get();
    await Promise.all(feedbackSnap.docs.map((d) => d.ref.delete()));

    // 4. Delete api_logs (may not exist yet — non-fatal if collection is absent)
    try {
      const logsSnap = await db.collection("api_logs").where("userId", "==", uid).get();
      await Promise.all(logsSnap.docs.map((d) => d.ref.delete()));
    } catch {
      // collection may not exist — not an error
    }

    // 5. Delete user profile last so auth context is still readable for earlier steps
    await db.collection("users").doc(uid).delete();

    res.json({ success: true });
  } catch (e: any) {
    console.error("[account] Delete account error:", e);
    res.status(500).json({ message: e?.message || "Failed to delete account data" });
  }
});

export default router;
