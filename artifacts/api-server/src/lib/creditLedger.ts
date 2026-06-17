/**
 * Credit Ledger — the ONLY layer allowed to mutate a user's creditBalance.
 *
 * ## Invariant
 *   Every change to users/{uid}.creditBalance MUST go through addCredits().
 *   Brain session reservations and refunds (brain.ts → reserveCredits /
 *   reconcileCredits) are exceptions: they write their own atomic transactions
 *   for performance (avoiding a function call per stream chunk), but they
 *   follow the same pattern — balance update + ledger entry in one Firestore
 *   transaction.
 *
 * ## Transaction types (CreditTxType)
 *   purchase           — Square one-time credit pack checkout
 *   subscription_grant — Subscription renewal top-up
 *   signup_bonus       — 50 free credits on first verified login
 *   usage              — session credit reservation (negative amount)
 *   refund             — post-session reconciliation or failure refund (positive)
 *   admin_adjustment   — manual admin grant or deduction
 *
 * ## Idempotency
 *   addCredits() accepts an idempotencyKey. When provided, the key is written
 *   atomically to payment_events. A second call with the same key is a no-op
 *   that returns { skipped: true }. Used for Square webhook deduplication.
 *
 * See docs/credits.md §6 for the full transaction type reference.
 */
import { getFirestoreDb, isFirebaseConfigured } from "./firebaseAdmin.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * All valid credit movement categories.
 * Every credit_transactions document carries exactly one of these.
 * The `source` field on the document provides additional human-readable
 * context within the category (e.g. "brain_reservation" vs "brain_failure_refund").
 */
export type CreditTxType =
  | "purchase"           // Stripe one-time pack
  | "subscription_grant" // Stripe subscription renewal
  | "signup_bonus"       // 50 free trial credits
  | "usage"              // session deduction (negative amount)
  | "refund"             // post-session reconciliation or failure (positive amount)
  | "admin_adjustment";  // manual admin grant or deduction

/** Shape of a document in the credit_transactions Firestore collection. */
export interface CreditTransaction {
  transactionId?: string;
  userId: string;
  type: CreditTxType;
  /** Positive = credit added; negative = credit deducted */
  amount: number;
  /** Balance AFTER this transaction was applied */
  balanceAfter?: number;
  /** Human-readable event source (e.g. "brain_reservation", "square_checkout") */
  source?: string;
  sessionId?: string | null;
  paymentId?: string | null;
  createdAt: string;
}

/** Normalize a Firestore Timestamp, JS Date, or ISO string to ISO string. */
function toIsoString(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date)      return v.toISOString();
  if (typeof v === "string")  return v;
  return new Date().toISOString();
}

/**
 * Add (or deduct, with a negative amount) credits to a user's balance.
 *
 * This is the single authoritative function for modifying creditBalance.
 * Every call atomically:
 *   1. (Optional) checks and writes the idempotency key.
 *   2. Reads the current balance.
 *   3. Writes the new balance to users/{uid}.
 *   4. Writes an immutable ledger document to credit_transactions.
 *
 * All four steps happen in a single Firestore transaction — either all
 * succeed or none do.
 *
 * @param uid    - Firebase UID of the user.
 * @param amount - Credits to add (positive) or subtract (negative).
 * @param type   - Transaction category (see CreditTxType).
 * @param opts.source           - Optional human-readable source label.
 * @param opts.sessionId        - Brain session ID for usage transactions.
 * @param opts.paymentId        - Square payment ID (or other processor reference).
 * @param opts.idempotencyKey   - If provided, this key is written to
 *   payment_events on first call and the operation is skipped on subsequent
 *   calls with the same key. Use Square event IDs or "signup_bonus_{uid}".
 *
 * @returns `{ newBalance }` on success, `{ newBalance: 0, skipped: true }` if
 *          the idempotency key was already present, or `null` if Firebase is
 *          not configured.
 */
export async function addCredits(
  uid: string,
  amount: number,
  type: CreditTxType,
  opts: {
    source?: string;
    sessionId?: string;
    paymentId?: string;
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
    // ── Idempotency guard ─────────────────────────────────────────────────────
    if (opts.idempotencyKey) {
      const dedupRef  = db.collection("payment_events").doc(opts.idempotencyKey);
      const dedupSnap = await tx.get(dedupRef);
      if (dedupSnap.exists) {
        // Already processed — safe to return without any balance mutation
        return { newBalance: 0, skipped: true };
      }
      tx.set(dedupRef, {
        eventType:   type,
        uid,
        amount,
        processedAt: FieldValue.serverTimestamp(),
      });
    }

    // ── Balance update ────────────────────────────────────────────────────────
    const snap    = await tx.get(userRef);
    const current: number = snap.exists ? ((snap.data()?.creditBalance as number) ?? 0) : 0;
    const newBalance = current + amount;

    tx.set(
      userRef,
      { creditBalance: newBalance, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    // ── Immutable ledger entry ────────────────────────────────────────────────
    const txRef = db.collection("credit_transactions").doc();
    tx.set(txRef, {
      userId:       uid,
      type,
      amount,
      balanceAfter: newBalance,
      source:       opts.source ?? type,
      sessionId:    opts.sessionId ?? null,
      paymentId:    opts.paymentId ?? null,
      createdAt:    FieldValue.serverTimestamp(),
    });

    return { newBalance };
  });
}

/**
 * Paginated transaction history for a user, ordered newest-first.
 *
 * @param uid    - Firebase UID.
 * @param limit  - Documents per page (default 50).
 * @param cursor - Document ID of the last item on the previous page.
 *                 Pass null / undefined for the first page.
 */
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
      .limit(limit + 1); // fetch one extra to detect hasMore

    if (cursor) {
      const cursorSnap = await db.collection("credit_transactions").doc(cursor).get();
      if (cursorSnap.exists) q = q.startAfter(cursorSnap);
    }

    const snap    = await q.get();
    const docs    = snap.docs;
    const hasMore = docs.length > limit;

    const items = docs.slice(0, limit).map((d) => {
      const data = d.data();
      return {
        transactionId: d.id,
        userId:        data["userId"]       as string,
        type:          data["type"]         as CreditTxType,
        amount:        data["amount"]       as number,
        balanceAfter:  data["balanceAfter"] as number | undefined,
        source:        data["source"]       as string | undefined,
        sessionId:     (data["sessionId"]   as string | null) ?? null,
        paymentId:     (data["paymentId"]   as string | null) ?? null,
        createdAt:     toIsoString(data["createdAt"]),
      } satisfies CreditTransaction;
    });

    return { items, nextCursor: hasMore ? docs[limit - 1].id : null };
  } catch (err) {
    console.error("[CreditLedger] getTransactions error:", err);
    return { items: [], nextCursor: null };
  }
}

/** Updates plan / subscription / Stripe fields on the user document (no credit change). */
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
    await db.collection("users").doc(uid).set(
      { ...data, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.error("[CreditLedger] updateUserPlan error:", err);
  }
}

/** Look up a user UID by their Stripe customer ID (for webhook handling). */
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
 * Idempotently grants 50 trial credits to a new user on first sign-in.
 *
 * Uses "signup_bonus_{uid}" as the idempotency key so this fires at most
 * once per user even if the auth webhook fires multiple times.
 */
export async function grantSignupBonus(uid: string): Promise<{ skipped: boolean }> {
  const result = await addCredits(uid, 50, "signup_bonus", {
    source:          "signup_trial",
    idempotencyKey:  `signup_bonus_${uid}`,
  });
  return { skipped: result?.skipped === true };
}

/**
 * Persists the user's auto-refill preference to Firestore.
 *
 * Auto-refill triggers a Stripe Checkout session whenever the user's
 * credit balance drops below `thresholdCredits`. The checkout URL is
 * written to users/{uid}.autoRefillCheckoutUrl for the frontend to pick up.
 *
 * See checkAndTriggerAutoRefill() below.
 */
export async function setAutoRefillPreference(
  uid: string,
  opts: {
    enabled: boolean;
    /** Balance level that triggers a top-up */
    thresholdCredits: number;
    /** Stripe Price ID of the credit pack to purchase */
    packPriceId: string;
  }
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = getFirestoreDb();
  if (!db) return;

  await db.collection("users").doc(uid).set(
    { autoRefill: opts, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * Checks whether the user's new balance has dropped below their auto-refill
 * threshold, and if so, generates a Stripe Checkout URL and stores it on the
 * user document so the frontend can redirect them to complete the purchase.
 *
 * Called after any credit deduction (e.g. in brain.ts after reconcile).
 *
 * @param uid                - Firebase UID.
 * @param newBalance         - Balance AFTER the deduction.
 * @param createCheckoutUrl  - Callback that generates a Stripe Checkout URL
 *                             for the given priceId and uid.
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

    const data       = userSnap.data()!;
    const autoRefill = data["autoRefill"] as
      | { enabled: boolean; thresholdCredits: number; packPriceId: string }
      | undefined;

    if (!autoRefill?.enabled)                      return;
    if (newBalance >= autoRefill.thresholdCredits) return; // still above threshold

    const url = await createCheckoutUrl(autoRefill.packPriceId, uid);
    if (!url) return;

    await db.collection("users").doc(uid).set(
      {
        autoRefillCheckoutUrl:    url,
        autoRefillTriggeredAt:    FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[CreditLedger] checkAndTriggerAutoRefill error:", err);
  }
}
