import { Router } from "express";
import { verifyIdToken, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { getUncachableStripeClient } from "../lib/stripeClient.js";
import {
  listProductsWithPrices,
  findCustomerByUserId,
  getSubscriptionByCustomerId,
} from "../lib/stripeStorage.js";
import { getTransactions, updateUserPlan } from "../lib/creditLedger.js";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

function isStripeConfigured(): boolean {
  return !!(
    process.env["REPLIT_CONNECTORS_HOSTNAME"] &&
    (process.env["REPL_IDENTITY"] || process.env["WEB_REPL_RENEWAL"])
  );
}

async function requireAuth(
  req: any,
  res: any
): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return decoded;
}

async function getOrCreateStripeCustomer(
  uid: string,
  email: string | undefined
): Promise<string> {
  const existing = await findCustomerByUserId(uid);
  if (existing) {
    const db = isFirebaseConfigured() ? getFirestoreDb() : null;
    if (db) {
      await db
        .collection("users")
        .doc(uid)
        .set({ stripeCustomerId: existing.id }, { merge: true });
    }
    return existing.id;
  }

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId: uid },
  });

  const db = isFirebaseConfigured() ? getFirestoreDb() : null;
  if (db) {
    await db
      .collection("users")
      .doc(uid)
      .set({ stripeCustomerId: customer.id }, { merge: true });
  }

  return customer.id;
}

router.get("/billing/products", async (_req, res) => {
  if (!isStripeConfigured()) {
    return res.json({ data: STATIC_PRODUCTS });
  }
  try {
    const products = await listProductsWithPrices();
    if (!products.length) {
      return res.json({ data: STATIC_PRODUCTS });
    }
    return res.json({ data: products });
  } catch (err: any) {
    console.warn("[Billing] products fallback:", err.message);
    return res.json({ data: STATIC_PRODUCTS });
  }
});

router.get("/billing/transactions", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const limit = Math.min(Number(req.query["limit"]) || 50, 100);
  const cursor = (req.query["cursor"] as string) || undefined;

  const result = await getTransactions(user.uid, limit, cursor);
  return res.json(result);
});

router.get("/billing/subscription", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isStripeConfigured()) {
    return res.json({ subscription: null });
  }

  try {
    const customer = await findCustomerByUserId(user.uid);
    if (!customer) return res.json({ subscription: null });

    const sub = await getSubscriptionByCustomerId(customer.id);
    return res.json({ subscription: sub });
  } catch {
    return res.json({ subscription: null });
  }
});

router.post("/billing/checkout", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const { priceId } = req.body as { priceId?: string };
  if (!priceId) {
    return res.status(400).json({ error: "priceId is required" });
  }

  try {
    const customerId = await getOrCreateStripeCustomer(user.uid, user.email);
    const stripe = await getUncachableStripeClient();

    const origin =
      req.headers["origin"] ||
      `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;

    const price = await stripe.prices.retrieve(priceId);
    const isSubscription = price.recurring !== null;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: isSubscription ? "subscription" : "payment",
      success_url: `${origin}/gh-brain/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${origin}/gh-brain/billing?cancelled=true`,
      metadata: {
        userId: user.uid,
        creditAmount: (price.metadata?.creditAmount as string) ?? "",
        plan: (price.metadata?.plan as string) ?? "",
      },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[Billing] checkout error:", err.message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/billing/portal", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  try {
    const customer = await findCustomerByUserId(user.uid);
    if (!customer) {
      return res.status(404).json({ error: "No billing account found" });
    }

    const stripe = await getUncachableStripeClient();
    const origin =
      req.headers["origin"] ||
      `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${origin}/gh-brain/billing`,
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[Billing] portal error:", err.message);
    return res.status(500).json({ error: "Failed to create portal session" });
  }
});

router.post("/billing/cancel-subscription", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  try {
    const customer = await findCustomerByUserId(user.uid);
    if (!customer) return res.status(404).json({ error: "No billing account" });

    const sub = await getSubscriptionByCustomerId(customer.id);
    if (!sub) return res.status(404).json({ error: "No active subscription" });

    const stripe = await getUncachableStripeClient();
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const STATIC_PRODUCTS = [
  {
    id: "starter_pack",
    name: "Starter Pack",
    description: "100 credits — great for exploring AI Brain",
    active: true,
    metadata: { type: "credit_pack", creditAmount: "100" },
    prices: [
      {
        id: "price_starter",
        product: "starter_pack",
        unit_amount: 499,
        currency: "usd",
        recurring: null,
        active: true,
        metadata: { creditAmount: "100" },
      },
    ],
  },
  {
    id: "pro_pack",
    name: "Pro Pack",
    description: "500 credits — best value for power users",
    active: true,
    metadata: { type: "credit_pack", creditAmount: "500" },
    prices: [
      {
        id: "price_pro_pack",
        product: "pro_pack",
        unit_amount: 1999,
        currency: "usd",
        recurring: null,
        active: true,
        metadata: { creditAmount: "500" },
      },
    ],
  },
  {
    id: "mega_pack",
    name: "Mega Pack",
    description: "1,000 credits — maximum savings",
    active: true,
    metadata: { type: "credit_pack", creditAmount: "1000" },
    prices: [
      {
        id: "price_mega_pack",
        product: "mega_pack",
        unit_amount: 3499,
        currency: "usd",
        recurring: null,
        active: true,
        metadata: { creditAmount: "1000" },
      },
    ],
  },
  {
    id: "pro_subscription",
    name: "Pro Plan",
    description: "2,000 credits per month + priority access",
    active: true,
    metadata: { type: "subscription", plan: "pro" },
    prices: [
      {
        id: "price_pro_monthly",
        product: "pro_subscription",
        unit_amount: 2900,
        currency: "usd",
        recurring: { interval: "month", interval_count: 1 },
        active: true,
        metadata: { creditAmount: "2000", plan: "pro" },
      },
    ],
  },
];

export default router;
