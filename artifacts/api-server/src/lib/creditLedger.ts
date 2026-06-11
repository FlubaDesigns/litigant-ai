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
  sessionId?: string;
  stripePaymentId?: string;
  createdAt: string;
}

export async function addCredits(
  uid: string,
  amount: number,
  type: CreditTxType,
  opts: {
    source?: string;
    sessionId?: string;
    stripePaymentId?: string;
  } = {}
): Promise<{ newBalance: number } | null> {
  if (!isFirebaseConfigured()) {
    console.warn("[CreditLedger] Firebase not configured — skipping credit grant for", uid);
    return null;
  }

  const db = getFirestoreDb();
  if (!db) return null;

  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
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
