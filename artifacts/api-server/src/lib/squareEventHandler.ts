import { recordRefillPayment, validateRefillPayment } from "./autoRefill.js";
import { CREDITS_PER_DOLLAR } from "./creditPacks.js";
import crypto from "crypto";
import { addCredits } from "./creditLedger.js";
import { isFirebaseConfigured } from "./firebaseAdmin.js";
import { logger } from "./logger.js";
import { sendPaymentReceiptEmail, isResendConfigured } from "./emailService.js";
import { validateCheckoutSnapshot } from "./checkoutSnapshot.js";
import { getAllCreditPacks } from "./creditPacksConfig.js";

/**
 * Verify a Square webhook signature.
 * Square computes: Base64( HMAC-SHA256( signingKey, notificationUrl + rawBody ) )
 * and sends it in the "x-square-hmacsha256-signature" header.
 *
 * If SQUARE_WEBHOOK_SIGNATURE_KEY is not set, the webhook is REJECTED (fail-closed).
 * Credits are minted from this endpoint, so an unverified webhook is an open door
 * to free credits for anyone who knows the documented payment-note format.
 * There is no safe "skip verification" mode.
 */
export function verifySquareWebhook(
  rawBody: string,
  signature: string,
  notificationUrl: string
): boolean {
  const signingKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  if (!signingKey) {
    logger.error(
      "[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — rejecting webhook. " +
        "Set this env var from the Square Developer Dashboard before going live; " +
        "without it, credit-granting webhooks cannot be verified and are refused."
    );
    return false;
  }

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  // timingSafeEqual throws (does not return false) if buffer lengths differ.
  // A mismatched or truncated signature header must be a clean rejection,
  // not an unhandled exception crashing the request.
  if (expectedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

interface SquareWebhookEvent {
  merchant_id: string;
  type: string;
  event_id: string;
  data: { object: Record<string, any> };
}

/**
 * Handle a verified Square webhook event and apply credit grants.
 *
 * Metadata is encoded in the payment note as:
 *   "LITIGANT:userId=<uid>,creditAmount=<n>,pack=<packId>"
 *
 * New pack checkouts carry a checkout marker and immutable server-owned terms.
 * The payment ID is the ledger idempotency key, independent of webhook event ID.
 */
export async function handleSquareEvent(event: SquareWebhookEvent): Promise<void> {
  switch (event.type) {
    case "payment.updated": {
      const payment = event.data.object["payment"];
      if (!payment) return;
      if (payment.status === "FAILED" || payment.status === "CANCELED") {
        const owner = payment.note?.match(/LITIGANT:userId=([^,]+)/)?.[1];
        if (owner) await recordRefillPayment(owner, payment);
        return;
      }
      if (payment.status !== "COMPLETED") return;

      // Resolve the provider order first: even a missing/malformed note must
      // fail retryably when this is one of our known checkout orders.
      const snapshot = await validateCheckoutSnapshot(payment);
      const note = typeof payment.note === "string" ? payment.note : "";
      const match = note.match(/LITIGANT:userId=([^,]+),creditAmount=(\d+)(?:,pack=([^,\s]+))?/);
      if (!match) {
        logger.warn(
          "[SquareEvent] payment.completed: no LITIGANT metadata in payment note — ignoring"
        );
        return;
      }

      if (!isFirebaseConfigured()) throw new Error("Payment storage is unavailable; retry processing");
      if (typeof payment.id !== "string" || !payment.id || /[\/\s]/.test(payment.id)) {
        throw new Error("Completed payment is missing a valid payment ID");
      }
      const userId = snapshot?.userId ?? match[1];
      const creditAmount = snapshot?.creditAmount ?? Number(match[2]);
      const packId = match[3] ?? null;
      if (!userId || !Number.isSafeInteger(creditAmount) || creditAmount <= 0) {
        throw new Error("Invalid payment credit amount; reconciliation required");
      }

      if (!snapshot) {
        // Compatibility for links issued before snapshots existed. Never invent
        // historical prices or credits when today's catalogue no longer verifies
        // them: retain a retryable failure for explicit payment reconciliation.
        if (creditAmount > 100_000) {
          throw new Error("Legacy payment exceeds its validation ceiling; reconciliation required");
        }
        if (packId === "custom" || note.includes("type=auto_refill")) {
          const cents = Number(payment.amount_money?.amount);
          if (!Number.isInteger(cents) || cents < 100 || cents > 50_000 ||
              creditAmount !== cents * CREDITS_PER_DOLLAR / 100 ||
              (payment.amount_money?.currency && payment.amount_money.currency !== "USD")) {
            throw new Error("Custom payment amount does not match the credit grant");
          }
        } else {
          if (!packId) throw new Error("Legacy checkout terms are missing; reconciliation required");
          let allPacks;
          try { allPacks = await getAllCreditPacks(); }
          catch { throw new Error("Credit-pack validation is unavailable; retry payment processing"); }
          const pack = allPacks[packId];
          const price = pack?.prices[0];
          const expectedCredits = Number(price?.metadata?.creditAmount ?? pack?.metadata?.creditAmount);
          const expectedCents = price?.unit_amount;
          const paidCents = payment.amount_money?.amount;
          // Active flags intentionally do not invalidate already-issued links.
          if (!pack || !Number.isSafeInteger(expectedCredits) || expectedCredits <= 0
            || expectedCredits !== creditAmount || !Number.isSafeInteger(expectedCents)
            || !expectedCents || expectedCents <= 0 || !Number.isSafeInteger(paidCents)
            || Math.abs(paidCents - expectedCents) > 5
            || payment.amount_money?.currency !== price?.currency?.toUpperCase()) {
            throw new Error("Legacy checkout cannot be verified from current terms; reconciliation required");
          }
        }
      }

      await validateRefillPayment(userId, payment);

      // Deduplication key is the payment ID, not the event ID.
      // Square can emit multiple distinct events for one payment (e.g. on retries);
      // keying on event_id would grant credits again for each distinct event delivery.
      // Keying on payment_<id> ensures exactly one grant per actual payment.
      const result = await addCredits(userId, creditAmount, "purchase", {
        source: "square_checkout",
        paymentId: payment.id as string,
        paidAmountMinor: Number(payment.amount_money?.amount),
        paidCurrency: payment.amount_money?.currency,
        idempotencyKey: `payment_${payment.id as string}`,
        ...(snapshot ? { checkoutOrderId: snapshot.orderId } : {}),
      });

      if (!result) throw new Error("Credit delivery is unavailable; retry payment processing");
      await recordRefillPayment(userId, payment);

      if (result?.skipped) {
        logger.info(`[SquareEvent] Event ${event.event_id} already processed — skipped`);
      } else {
        logger.info(`[SquareEvent] Granted ${creditAmount} credits to ${userId}`);

        // Send payment receipt — only on a genuine, non-duplicate completed payment
        if (isResendConfigured()) {
          const amountPaidCents = (payment.amount_money?.amount as number | undefined) ?? 0;
          const newBalance = result?.newBalance ?? 0;
          sendPaymentReceiptEmail(userId, creditAmount, amountPaidCents, newBalance)
            .catch((e) => logger.error(`[SquareEvent] Receipt email failed (non-fatal): ${e.message}`));
        }
      }
      break;
    }

    default:
      logger.debug(`[SquareEvent] Unhandled event type: ${event.type}`);
      break;
  }
}
