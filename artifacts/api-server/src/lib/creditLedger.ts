import { getFirestoreDb, isFirebaseConfigured } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export type CreditTxType =
  | "purchase"
  | "subscription_grant"
  | "signup_bonus"
  | "usage"
  | "refund"
  | "admin_adjustment";

export interface CreditTransaction {
  transactionId?: string;
  userId: string;
  type: CreditTxType;
  amount: number;
  balanceAfter?: number;
  source?: string;
  sessionId?: string | null;
  stripePaymentId?: string | null;
  createdAt: string;
}

/**
 * Add credits to a user's balance.
 *
 * @param opts.idempotencyKey - A unique key (e.g. Stripe event ID or "signup_bonus_{uid}") that
 *   prevents the same grant from firing more than once. If the key already exists in
 *   `stripe_events`, the operation is skipped and `{ skipped: true }` is returned.
 *   The check + grant are performed inside one Firestore transaction.
 */
export async function addCredits(
  uid: string,
  amount: number,
  type: CreditTxType,
  opts: {
    source?: string;
    sessionId?: string;
    stripePaymentId?: string;
    idempotencyKey?: string;
  } = {}
): Promise<{ newBalance: number; skipped?: boolean } | null> {
  if (!isFirebaseConfigured()) {
    console.warn("[CreditLedger] Firebase not configured — skipping credit grant for", uid);
    return null;
  }

  const db = getFirestoreDb();
  if (!db) return null;

  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    // ── Idempotency guard ────────────────────────────────────────────────
    if (opts.idempotencyKey) {
      const dedupRef = db.collection("stripe_events").doc(opts.idempotencyKey);
      const dedupSnap = await tx.get(dedupRef);
      if (dedupSnap.exists) {
        return { newBalance: 0, skipped: true };
      }
      // Mark as processed atomically with the credit grant
      tx.set(dedupRef, {
        eventType: type,
        uid,
        amount,
        processedAt: FieldValue.serverTimestamp(),
      });
    }

    // ── Credit grant ─────────────────────────────────────────────────────
    const snap = await tx.get(userRef);
    const current: number = snap.exists ? ((snap.data()?.creditBalance as number) ?? 0) : 0;
    const newBalance = current + amount;

    tx.set(
      userRef,
      {
        creditBalance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const txRef = db.collection("credit_transactions").doc();
    const txDoc: CreditTransaction = {
      userId: uid,
      type,
      amount,
      balanceAfter: newBalance,
      source: opts.source ?? type,
      sessionId: opts.sessionId ?? null,
      stripePaymentId: opts.stripePaymentId ?? null,
      createdAt: new Date().toISOString(),
    };
    tx.set(txRef, txDoc);

    // ── Auto-refill check ─────────────────────────────────────────────────
    // Deferred — handled separately in checkAndTriggerAutoRefill()
    return { newBalance };
  });
}

export async function getTransactions(
  uid: string,
  limit = 50,
  cursor?: string
): Promise<{ items: CreditTransaction[]; nextCursor: string | null }> {
  if (!isFirebaseConfigured()) return { items: [], nextCursor: null };

  const db = getFirestoreDb();
  if (!db) return { items: [], nextCursor: null };

  try {
    let q = db
      .collection("credit_transactions")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorSnap = await db.collection("credit_transactions").doc(cursor).get();
      if (cursorSnap.exists) {
        q = q.startAfter(cursorSnap);
      }
    }

    const snap = await q.get();
    const docs = snap.docs;
    const hasMore = docs.length > limit;
    const items = docs.slice(0, limit).map((d) => ({
      transactionId: d.id,
      ...(d.data() as Omit<CreditTransaction, "transactionId">),
    }));

    return {
      items,
      nextCursor: hasMore ? docs[limit - 1].id : null,
    };
  } catch (err) {
    console.error("[CreditLedger] getTransactions error:", err);
    return { items: [], nextCursor: null };
  }
}

export async function updateUserPlan(
  uid: string,
  data: {
    plan?: "free" | "starter" | "pro" | "team";
    subscriptionStatus?: "none" | "active" | "cancelled" | "past_due";
    stripeCustomerId?: string;
  }
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection("users")
      .doc(uid)
      .set(
        { ...data, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
  } catch (err) {
    console.error("[CreditLedger] updateUserPlan error:", err);
  }
}

export async function getUserIdByStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;

  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snap = await db
      .collection("users")
      .where("stripeCustomerId", "==", stripeCustomerId)
      .limit(1)
      .get();
    return snap.empty ? null : snap.docs[0].id;
  } catch {
    return null;
  }
}

/**
 * Idempotently grant 50 trial credits to a new user.
 * Uses "signup_bonus_{uid}" as the idempotency key so this
 * can only fire once per user even if called multiple times.
 */
export async function grantSignupBonus(uid: string): Promise<{ skipped: boolean }> {
  const result = await addCredits(uid, 50, "signup_bonus", {
    source: "signup_trial",
    idempotencyKey: `signup_bonus_${uid}`,
  });
  return { skipped: result?.skipped === true };
}

/**
 * Persist auto-refill preference for a user.
 */
export async function setAutoRefillPreference(
  uid: string,
  opts: {
    enabled: boolean;
    thresholdCredits: number;
    packPriceId: string;
  }
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection("users")
    .doc(uid)
    .set(
      { autoRefill: opts, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
}

/**
 * After credit usage drops below the auto-refill threshold, generate a
 * checkout URL and store it in Firestore so the frontend can redirect the user.
 *
 * This is called server-side after credit deductions in the brain engine.
 */
export async function checkAndTriggerAutoRefill(
  uid: string,
  newBalance: number,
  createCheckoutUrl: (priceId: string, uid: string) => Promise<string | null>
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return;

    const data = userSnap.data()!;
    const autoRefill = data.autoRefill as
      | { enabled: boolean; thresholdCredits: number; packPriceId: string }
      | undefined;

    if (!autoRefill?.enabled) return;
    if (newBalance >= autoRefill.thresholdCredits) return;

    const url = await createCheckoutUrl(autoRefill.packPriceId, uid);
    if (!url) return;

    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          autoRefillCheckoutUrl: url,
          autoRefillTriggeredAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (err) {
    console.error("[CreditLedger] checkAndTriggerAutoRefill error:", err);
  }
}
