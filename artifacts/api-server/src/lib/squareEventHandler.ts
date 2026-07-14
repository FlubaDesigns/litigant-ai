import crypto from "crypto";
import { addCredits } from "./creditLedger.js";
import { isFirebaseConfigured } from "./firebaseAdmin.js";
import { logger } from "./logger.js";
import { sendPaymentReceiptEmail, isResendConfigured } from "./emailService.js";

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
 * The event_id is used as the idempotency key so exactly-once semantics
 * are preserved even if Square retries the webhook.
 */
export async function handleSquareEvent(event: SquareWebhookEvent): Promise<void> {
  if (!isFirebaseConfigured()) return;

  switch (event.type) {
    case "payment.updated": {
      const payment = event.data.object["payment"];
      if (!payment) return;
      // Only process when payment reaches COMPLETED status
      if (payment.status !== "COMPLETED") return;

      const note: string = payment.note ?? "";
      const match = note.match(/LITIGANT:userId=([^,]+),creditAmount=(\d+)/);
      if (!match) {
        logger.warn(
          "[SquareEvent] payment.completed: no LITIGANT metadata in payment note — ignoring"
        );
        return;
      }

      const userId = match[1];
      const creditAmount = parseInt(match[2], 10);
      if (!userId || !creditAmount) return;

      // Defense-in-depth: no legitimate credit pack or custom top-up (see
      // creditPacks.ts, max $500 → 50,000 credits) ever produces a value
      // this large. Catches a malformed/forged note even if signature
      // verification is ever misconfigured.
      const MAX_CREDIT_GRANT = 100_000;
      if (creditAmount > MAX_CREDIT_GRANT) {
        logger.error(
          `[SquareEvent] Rejected suspicious creditAmount=${creditAmount} for ${userId} — exceeds ${MAX_CREDIT_GRANT} cap`
        );
        return;
      }

      const result = await addCredits(userId, creditAmount, "purchase", {
        source: "square_checkout",
        paymentId: payment.id as string,
        idempotencyKey: event.event_id,
      });

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
