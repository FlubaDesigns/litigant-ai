import crypto from "crypto";
import { addCredits } from "./creditLedger.js";
import { isFirebaseConfigured } from "./firebaseAdmin.js";
import { logger } from "./logger.js";

/**
 * Verify a Square webhook signature.
 * Square computes: Base64( HMAC-SHA256( signingKey, notificationUrl + rawBody ) )
 * and sends it in the "x-square-hmacsha256-signature" header.
 *
 * If SQUARE_WEBHOOK_SIGNATURE_KEY is not set we log a warning and allow the
 * request through — useful during initial sandbox testing.
 */
export function verifySquareWebhook(
  rawBody: string,
  signature: string,
  notificationUrl: string
): boolean {
  const signingKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  if (!signingKey) {
    logger.warn(
      "[SquareWebhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — skipping verification (set it in production)"
    );
    return true;
  }

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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

      const result = await addCredits(userId, creditAmount, "purchase", {
        source: "square_checkout",
        paymentId: payment.id as string,
        idempotencyKey: event.event_id,
      });

      if (result?.skipped) {
        logger.info(`[SquareEvent] Event ${event.event_id} already processed — skipped`);
      } else {
        logger.info(`[SquareEvent] Granted ${creditAmount} credits to ${userId}`);
      }
      break;
    }

    default:
      logger.debug(`[SquareEvent] Unhandled event type: ${event.type}`);
      break;
  }
}
