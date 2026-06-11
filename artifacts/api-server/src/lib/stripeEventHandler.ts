import { addCredits, updateUserPlan, getUserIdByStripeCustomer } from "./creditLedger.js";
import { isFirebaseConfigured } from "./firebaseAdmin.js";
import { logger } from "./logger.js";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

const SUBSCRIPTION_MONTHLY_CREDITS = 2000;

export async function handleStripeEventForFirestore(event: StripeEvent): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const userId: string = obj.metadata?.userId;
      if (!userId) {
        logger.warn("[StripeEvent] checkout.session.completed: no userId in metadata");
        return;
      }

      if (obj.mode === "payment" && obj.payment_status === "paid") {
        const creditAmount = parseInt(obj.metadata?.creditAmount ?? "0", 10);
        if (creditAmount > 0) {
          // Idempotency key = Stripe event ID, ensuring exactly-once credit grant
          const result = await addCredits(userId, creditAmount, "purchase", {
            source: "stripe_checkout",
            stripePaymentId: obj.payment_intent ?? obj.id,
            idempotencyKey: event.id,
          });
          if (result?.skipped) {
            logger.info(`[StripeEvent] Event ${event.id} already processed — skipped`);
          } else {
            logger.info(`[StripeEvent] Added ${creditAmount} credits to ${userId}`);
          }
        }
      }

      if (obj.mode === "subscription") {
        const plan = obj.metadata?.plan ?? "pro";
        await updateUserPlan(userId, {
          plan: plan as "pro",
          subscriptionStatus: "active",
        });
        logger.info(`[StripeEvent] Updated plan to ${plan} for ${userId}`);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const customerId: string = obj.customer;
      if (!customerId) return;

      const billingReason: string = obj.billing_reason ?? "";
      const isSubscriptionEvent =
        billingReason === "subscription_create" || billingReason === "subscription_cycle";
      if (!isSubscriptionEvent) return;

      const userId = await getUserIdByStripeCustomer(customerId);
      if (!userId) return;

      const source =
        billingReason === "subscription_create" ? "pro_monthly_new" : "pro_monthly_renewal";

      // Idempotency key = Stripe event ID (unique per invoice payment)
      const result = await addCredits(userId, SUBSCRIPTION_MONTHLY_CREDITS, "subscription_grant", {
        source,
        stripePaymentId: obj.payment_intent ?? obj.id,
        idempotencyKey: event.id,
      });

      if (result?.skipped) {
        logger.info(`[StripeEvent] Invoice event ${event.id} already processed — skipped`);
      } else {
        logger.info(
          `[StripeEvent] Granted ${SUBSCRIPTION_MONTHLY_CREDITS} credits (${source}) to ${userId}`
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const customerId: string = obj.customer;
      if (!customerId) return;

      const userId = await getUserIdByStripeCustomer(customerId);
      if (userId) {
        await updateUserPlan(userId, {
          plan: "free",
          subscriptionStatus: "cancelled",
        });
        logger.info(`[StripeEvent] Downgraded ${userId} to free plan`);
      }
      break;
    }

    case "customer.subscription.updated": {
      const customerId: string = obj.customer;
      if (!customerId) return;

      const userId = await getUserIdByStripeCustomer(customerId);
      if (userId) {
        const status = obj.status;
        let subscriptionStatus: "active" | "cancelled" | "past_due" | "none" = "none";
        if (status === "active" || status === "trialing") subscriptionStatus = "active";
        else if (status === "past_due") subscriptionStatus = "past_due";
        else if (status === "canceled" || status === "cancelled") subscriptionStatus = "cancelled";

        await updateUserPlan(userId, { subscriptionStatus });
      }
      break;
    }

    default:
      break;
  }
}
