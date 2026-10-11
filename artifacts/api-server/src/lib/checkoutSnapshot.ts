import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { CREDIT_PACK_BOUNDS } from "./creditPacksConfig.js";
import type { CreditPack, CreditPackPrice } from "./creditPacks.js";
import { createPaymentLink, getSquareLocationId } from "./squareClient.js";

/** Server-owned, create-only terms. Never resolve a completed checkout from today's catalogue. */
export interface CheckoutSnapshot {
  version: 1;
  checkoutId: string;
  userId: string;
  packId: string;
  priceId: string;
  amountCents: number;
  currency: "USD";
  creditAmount: number;
  benefits: { plan: "pro" };
  orderId: string;
  paymentLinkId: string;
  locationId: string;
  note: string;
}

const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  !/[\/,\s]/.test(value);

function validTerms(value: CheckoutSnapshot): boolean {
  return (
    value.version === 1 &&
    validId(value.checkoutId) &&
    validId(value.userId) &&
    validId(value.packId) &&
    validId(value.priceId) &&
    validId(value.orderId) &&
    validId(value.paymentLinkId) &&
    validId(value.locationId) &&
    Number.isSafeInteger(value.amountCents) &&
    value.amountCents >= CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS &&
    value.amountCents <= CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS &&
    Number.isSafeInteger(value.creditAmount) &&
    value.creditAmount >= CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT &&
    value.creditAmount <= CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT &&
    value.currency === "USD" &&
    value.benefits?.plan === "pro" &&
    value.note === checkoutNote(value)
  );
}

function checkoutNote(
  terms: Pick<
    CheckoutSnapshot,
    "userId" | "creditAmount" | "packId" | "checkoutId"
  >,
): string {
  return `LITIGANT:userId=${terms.userId},creditAmount=${terms.creditAmount},pack=${terms.packId},checkout=${terms.checkoutId}`;
}

export async function createPackCheckout(
  user: { uid: string; email?: string },
  product: CreditPack,
  price: CreditPackPrice,
  redirectUrl: string,
) {
  const db = getFirestoreDb();
  if (!db) throw new Error("Checkout storage is unavailable");
  // Capture scalar values before the provider request. Caller-supplied prices,
  // credits and benefits are never accepted; these objects came from the catalogue.
  const terms = {
    version: 1 as const,
    checkoutId: crypto.randomUUID(),
    userId: user.uid,
    packId: product.id,
    priceId: price.id,
    amountCents: price.unit_amount,
    currency: price.currency?.toUpperCase() as "USD",
    creditAmount: Number(
      price.metadata?.creditAmount ?? product.metadata?.creditAmount,
    ),
    benefits: { plan: "pro" as const },
    locationId: getSquareLocationId(),
  };
  const note = checkoutNote(terms);
  if (
    !validTerms({
      ...terms,
      orderId: "pending",
      paymentLinkId: "pending",
      note,
    })
  ) {
    throw new Error("Credit-pack checkout terms are invalid");
  }
  const link = await createPaymentLink({
    name: `${product.name} — ${terms.creditAmount} Credits`,
    amountCents: terms.amountCents,
    note,
    redirectUrl,
    buyerEmail: user.email,
    idempotencyKey: terms.checkoutId,
  });
  const snapshot: CheckoutSnapshot = {
    ...terms,
    orderId: link.order_id,
    paymentLinkId: link.id,
    note,
  };
  if (!validTerms(snapshot) || typeof link.url !== "string" || !link.url) {
    throw new Error("Square returned an invalid checkout binding");
  }
  // create() refuses overwrites. A failed write must never expose a payable URL.
  // The checkout marker makes missing snapshots retryable, never a legacy fallback.
  await db
    .collection("checkout_snapshots")
    .doc(snapshot.orderId)
    .create({
      ...snapshot,
      createdAt: FieldValue.serverTimestamp(),
    });
  return link;
}

/** Returns null only for an unmarked legacy order with no saved snapshot. */
export async function validateCheckoutSnapshot(payment: {
  id?: unknown;
  note?: unknown;
  order_id?: unknown;
  location_id?: unknown;
  amount_money?: { amount?: unknown; currency?: unknown };
}): Promise<CheckoutSnapshot | null> {
  const note = typeof payment.note === "string" ? payment.note : "";
  const marked = note.includes(",checkout=");
  if (!validId(payment.order_id)) {
    if (marked)
      throw new Error("Checkout payment is missing its Square order binding");
    return null;
  }
  const db = getFirestoreDb();
  if (!db)
    throw new Error(
      "Checkout validation is unavailable; retry payment processing",
    );
  const doc = await db
    .collection("checkout_snapshots")
    .doc(payment.order_id)
    .get();
  if (!doc.exists) {
    if (marked)
      throw new Error(
        "Checkout snapshot is unavailable; retry or reconcile payment",
      );
    return null;
  }
  const snapshot = doc.data() as CheckoutSnapshot;
  if (!snapshot || !validTerms(snapshot)) {
    throw new Error(
      "Saved checkout terms are invalid; reconciliation required",
    );
  }
  if (
    !validId(payment.id) ||
    snapshot.orderId !== payment.order_id ||
    snapshot.locationId !== payment.location_id ||
    snapshot.note !== note ||
    snapshot.amountCents !== payment.amount_money?.amount ||
    snapshot.currency !== payment.amount_money?.currency
  ) {
    throw new Error(
      "Completed payment does not match its saved checkout terms",
    );
  }
  return snapshot;
}
