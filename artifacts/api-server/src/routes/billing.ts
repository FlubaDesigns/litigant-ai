import { Router } from "express";
import crypto from "crypto";
import { verifyIdToken, isFirebaseConfigured } from "../lib/firebaseAdmin.js";
import { isSquareConfigured, createPaymentLink } from "../lib/squareClient.js";
import {
  getTransactions,
  updateUserPlan,
  grantSignupBonus,
  setAutoRefillPreference,
} from "../lib/creditLedger.js";

const router = Router();

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

/**
 * POST /billing/signup-grant
 * Idempotently grants 50 trial credits to a new user.
 */
router.post("/billing/signup-grant", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isFirebaseConfigured()) {
    return res.json({ granted: false, reason: "firebase_not_configured" });
  }

  try {
    const result = await grantSignupBonus(user.uid);
    return res.json({ granted: !result.skipped, skipped: result.skipped });
  } catch (err: any) {
    console.error("[Billing] signup-grant error:", err.message);
    return res.status(500).json({ error: "Failed to grant signup bonus" });
  }
});

/**
 * PATCH /billing/auto-refill
 * Persists the user's auto-refill preference to Firestore.
 */
router.patch("/billing/auto-refill", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { enabled, thresholdCredits, packPriceId } = req.body as {
    enabled?: boolean;
    thresholdCredits?: number;
    packPriceId?: string;
  };

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  await setAutoRefillPreference(user.uid, {
    enabled,
    thresholdCredits: thresholdCredits ?? 20,
    packPriceId: packPriceId ?? "starter_pack",
  });

  return res.json({ success: true });
});

/**
 * GET /billing/products
 * Returns available credit packs.
 */
router.get("/billing/products", async (_req, res) => {
  return res.json({ data: STATIC_PRODUCTS });
});

/**
 * GET /billing/transactions
 * Returns paginated credit transaction history from Firestore.
 */
router.get("/billing/transactions", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const limit = Math.min(Number(req.query["limit"]) || 50, 100);
  const cursor = (req.query["cursor"] as string) || undefined;

  const result = await getTransactions(user.uid, limit, cursor);
  return res.json(result);
});

/**
 * GET /billing/payment-history
 * Returns purchase transactions from Firestore (replaces Stripe payment intent history).
 */
router.get("/billing/payment-history", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { items } = await getTransactions(user.uid, 20);
  const purchases = items
    .filter((t) => t.type === "purchase")
    .map((t) => ({
      id: t.transactionId ?? t.paymentId ?? "",
      amount: t.amount,
      currency: "usd",
      status: "completed",
      created: Math.floor(new Date(t.createdAt).getTime() / 1000),
      description: `${t.amount} credits`,
    }));

  return res.json({ data: purchases });
});

/**
 * GET /billing/subscription
 * Square does not manage subscriptions — returns null.
 */
router.get("/billing/subscription", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  return res.json({ subscription: null });
});

/**
 * POST /billing/checkout
 * Creates a Square Payment Link for the requested credit pack.
 */
router.post("/billing/checkout", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isSquareConfigured()) {
    return res.status(503).json({ error: "Square not configured" });
  }

  const { priceId } = req.body as { priceId?: string };
  if (!priceId) {
    return res.status(400).json({ error: "priceId is required" });
  }

  const product = STATIC_PRODUCTS.find((p) =>
    p.prices.some((pr) => pr.id === priceId)
  );
  const price = product?.prices.find((pr) => pr.id === priceId);

  if (!product || !price || !price.unit_amount) {
    return res.status(404).json({ error: "Unknown price ID" });
  }

  const creditAmount = parseInt(
    price.metadata?.creditAmount ?? product.metadata?.creditAmount ?? "0",
    10
  );

  if (!creditAmount) {
    return res.status(400).json({ error: "Credit amount not configured for this product" });
  }

  const origin =
    (req.headers["origin"] as string | undefined) ||
    (process.env["APP_DOMAIN"] ? `https://${process.env["APP_DOMAIN"]}` : null) ||
    `https://${(process.env["REPLIT_DOMAINS"] as string | undefined)?.split(",")[0]}`;

  try {
    const idempotencyKey = crypto.randomUUID();
    const note = `LITIGANT:userId=${user.uid},creditAmount=${creditAmount},pack=${product.id}`;

    const link = await createPaymentLink({
      name: `${product.name} — ${creditAmount} Credits`,
      amountCents: price.unit_amount,
      note,
      redirectUrl: `${origin}/gh-brain/billing?success=true`,
      buyerEmail: user.email,
      idempotencyKey,
    });

    return res.json({ url: link.url });
  } catch (err: any) {
    console.error("[Billing] Square checkout error:", err.message);
    return res.status(500).json({ error: "Failed to create checkout link" });
  }
});

/**
 * POST /billing/cancel-subscription
 * Not applicable — Square does not manage subscriptions here.
 */
router.post("/billing/cancel-subscription", async (_req, res) => {
  return res.status(501).json({ error: "Subscriptions are not available" });
});

const STATIC_PRODUCTS = [
  {
    id: "starter_pack",
    name: "Starter Pack",
    description: "100 credits — great for exploring Litigant AI",
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
];

export default router;
