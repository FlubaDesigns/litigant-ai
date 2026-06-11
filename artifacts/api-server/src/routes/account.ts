import { Router } from "express";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

/**
 * DELETE /account — delete all user data from Firestore (profile + sessions + session_turns).
 * Client calls this BEFORE deleting the Firebase Auth user so we still have the auth context.
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
    // Delete all sessions + their session_turns subcollections
    const sessionsSnap = await db
      .collection("sessions")
      .where("userId", "==", uid)
      .get();

    await Promise.all(
      sessionsSnap.docs.map(async (sessionDoc) => {
        const turnsSnap = await sessionDoc.ref.collection("session_turns").get();
        await Promise.all(turnsSnap.docs.map((t) => t.ref.delete()));
        await sessionDoc.ref.delete();
      })
    );

    // Delete feedback docs
    const feedbackSnap = await db
      .collection("feedback")
      .where("userId", "==", uid)
      .get();
    await Promise.all(feedbackSnap.docs.map((d) => d.ref.delete()));

    // Delete user profile
    await db.collection("users").doc(uid).delete();

    res.json({ success: true });
  } catch (e: any) {
    console.error("[account] Delete account error:", e);
    res.status(500).json({ message: e?.message || "Failed to delete account data" });
  }
});

export default router;
