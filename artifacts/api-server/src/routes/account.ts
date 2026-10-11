import crypto from "node:crypto";
import { recoverCreditRuns } from "../lib/creditRunSettlement.js";
import { removeAutoRefillCard, reconcileAutoRefillAttempt } from "../lib/autoRefill.js";
import { Router } from "express";
import { verifyIdToken, getFirestoreDb } from "../lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

const router = Router();
type Phase = "preparing" | "data" | "auth" | "profile";
const LEASE_MS = 15 * 60 * 1000;

/** Owner-only, resumable teardown. The default-denied account_deletions collection carries a temporary,
 * server-owned deletion fence. The profile only mirrors its status for the UI.
 * The fence is removed after Auth deletion and final cleanup. No permanent record
 * or credit/payment retention is introduced. Existing payment dedup records keep
 * their existing retention policy; retry never provisions a profile or charges.
 */
router.delete("/account", async (req, res) => {
  const db = getFirestoreDb();
  const authHeader = req.headers["authorization"];
  if (!db || !authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
  const decoded = await verifyIdToken(authHeader.slice(7), { allowAccountDeletion: true });
  if (!decoded) return res.status(401).json({ message: "Sign in again to retry deletion, or contact support if the sign-in account is already unavailable." });

  const uid = decoded.uid, user = db.collection("users").doc(uid);
  const fence = db.collection("account_deletions").doc(uid);
  const requestId = crypto.randomUUID();
  let phase: Phase = "preparing", appDataDeleted = false, authDeleted = false, claimed = false;
  const result = (code: string, message: string, retryable = true) => ({
    success: false, code, phase, appDataDeleted, authDeleted, retryable, message,
  });
  // All marker writes are fenced: a timed-out request cannot restore a profile
  // after a newer request has completed deletion. Never persist raw errors/PII.
  async function checkpoint(next: Phase, minimal = false) {
    await db!.runTransaction(async tx => {
      const current = (await tx.get(fence)).data();
      if (current?.requestId !== requestId) throw new Error("Deletion request superseded");
      const accountDeletion = { phase: next, appDataDeleted, requestId, leaseUntil: Date.now() + LEASE_MS };
      tx.set(fence, accountDeletion);
      if (minimal) tx.delete(user);
    });
    phase = next;
  }
  async function release() {
    if (!claimed) return;
    await db!.runTransaction(async tx => {
      const current = (await tx.get(fence)).data();
      if (current?.requestId === requestId) tx.update(fence, { leaseUntil: 0 });
    });
  }
  try {
    claimed = await db.runTransaction(async tx => {
      const previous = (await tx.get(fence)).data();
      appDataDeleted = previous?.appDataDeleted === true;
      phase = previous?.phase ?? "preparing";
      if (previous?.leaseUntil > Date.now()) return false;
      phase = appDataDeleted ? "auth" : "preparing";
      const profile = await tx.get(user);
      tx.set(fence, { phase, appDataDeleted, requestId, leaseUntil: Date.now() + LEASE_MS });
      if (profile.exists) tx.update(user, { accountDeletion: true,
        "autoRefill.enabled": false, "autoRefill.consentVersion": 0, "autoRefill.revision": requestId });
      return true;
    });
    if (!claimed) return res.status(409).json(result("deletion_in_progress", "Account deletion is already running. Wait for it to finish before retrying."));

    if (!appDataDeleted) {
      // Recovery only: this never starts a top-up. Keep these guards before
      // removing any billing proof or user data needed for settlement.
      await removeAutoRefillCard(uid);
      await reconcileAutoRefillAttempt(uid);
      await recoverCreditRuns(uid);
      const runs = await db.collection("credit_runs").where("userId", "==", uid).get();
      const billingAccount = db.collection("billing_accounts").doc(uid);
      if (runs.docs.some(doc => doc.data().state !== "settled")) {
        await release();
        return res.status(409).json(result("settlement_pending", "Auto Top-Up is off. A conversation or credit settlement is still in progress. Retry deletion after it finishes."));
      }
      if ((await billingAccount.get()).data()?.activeAttempt) {
        await release();
        return res.status(409).json(result("payment_pending", "Auto Top-Up is off. A payment is still awaiting confirmation. Retry deletion once it is resolved."));
      }
      await checkpoint("data");
      // Sequential stages make progress truthful and ensure no sibling deletes
      // are still running when an error response invites a retry.
      await billingAccount.delete();
      for (const doc of runs.docs) await doc.ref.delete();
      for (const [collection, field] of [["auto_refill_attempts", "uid"], ["sessions", "userId"],
        ["credit_transactions", "userId"], ["feedback", "userId"], ["api_logs", "userId"]] as const) {
        const snapshot = await db.collection(collection).where(field, "==", uid).get();
        for (const doc of snapshot.docs) {
          if (collection === "sessions") {
            const turns = await doc.ref.collection("session_turns").get();
            for (const turn of turns.docs) await turn.ref.delete();
          }
          await doc.ref.delete();
        }
      }
      // Missing Firestore collections return empty snapshots. Permission/write
      // errors (including logs) are real partial failures, never silent success.
      appDataDeleted = true;
      try { await checkpoint("auth", true); }
      catch (error) { appDataDeleted = false; throw error; }
    }
    await checkpoint("auth");
    try { await getAuth().deleteUser(uid); }
    catch (error: any) { if (error?.code !== "auth/user-not-found") throw error; }
    authDeleted = true;
    phase = "profile";
    await db.runTransaction(async tx => {
      const current = (await tx.get(fence)).data();
      if (current?.requestId !== requestId) throw new Error("Deletion request superseded");
      tx.delete(fence);
    });
    return res.json({ success: true, code: "deleted", phase: "complete", appDataDeleted: true, authDeleted: true, retryable: false });
  } catch (error: any) {
    console.error("[account] Deletion incomplete", { uid, phase, code: error?.code ?? "operation_failed" });
    await release().catch(() => {}); // Failure leaves a bounded lease, not a success claim.
    const message = authDeleted
      ? "Your sign-in account and app data were removed, but final deletion cleanup is incomplete. Contact support with your account ID so they can remove the remaining deletion marker."
      : appDataDeleted
        ? "Your app data was removed, but your sign-in account has not been confirmed deleted. Retry deletion here. If this keeps failing, contact support with your account ID."
        : "Account deletion is incomplete. Some data may already have been removed. Auto Top-Up may be off. Retry deletion here, or contact support if it keeps failing.";
    return res.status(503).json(result(authDeleted ? "cleanup_required" : "deletion_incomplete", message, !authDeleted));
  }
});

export default router;
