import { AdjustmentConflictError } from "../../lib/creditLedger.js";
import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { addCredits } from "../../lib/creditLedger.js";
import { FieldValue, FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { sendAccountSuspendedEmail, isResendConfigured } from "../../lib/emailService.js";
import { safeError } from "../../lib/safeError.js";
import { requireAdmin, serializeDoc } from "./shared.js";

const router = Router();


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
    const users = snap.docs.slice(0, limit).map(doc => serializeDoc(doc));
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
      recentSessions: sessionsSnap.docs.map((d) => serializeDoc(d, true)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.post("/admin/users/:uid/credits", requireAdmin, async (req: any, res) => {
  const { amount, reason, requestId } = req.body as { amount?: number; reason?: string; requestId?: string };
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(requestId) ||
      (reason !== undefined && (typeof reason !== "string" || reason.length > 500))) {
    return res.status(400).json({error: "A valid adjustment request ID and reason are required. Reload the adjustment form."});
  }
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount === 0) {
    return res.status(400).json({ error: "amount (number) is required" });
  }

  try {
    const result = await addCredits(req.params["uid"]!, amount, "admin_adjustment", {
      source: reason ?? `admin_adjustment_by_${req.adminUid as string}`,
      idempotencyKey: `admin_adjustment_${req.adminUid}_${requestId}`,
    });
    if (!result) return res.status(503).json({ error: "Firebase not configured" });
    return res.json({ success: true, newBalance: result.newBalance, skipped: result.skipped === true });
  } catch (err: any) {
    return res.status(err instanceof AdjustmentConflictError ? 409 : 500).json({ error: err instanceof AdjustmentConflictError ? err.message : safeError(err) });
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
    if (banned && (await isResendConfigured())) {
      sendAccountSuspendedEmail(req.params["uid"]!, reason)
        .catch((e) => console.error("[admin] Account-suspended email failed (non-fatal):", e));
    }

    return res.status(authWarning ? 503 : 200).json({
      success: !authWarning,
      banned,
      ...(authWarning ? { authWarning, retryable: true } : {}),
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
export default router;
