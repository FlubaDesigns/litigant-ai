/**
 * Canonical credit pack definitions shared by billing.ts (checkout) and
 * brain.ts (auto-refill Square payment link creation).
 *
 * Keeping them in one place ensures the product catalogue is always
 * consistent between the two call sites.
 */

export interface CreditPackPrice {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: null;
  active: boolean;
  metadata: { creditAmount: string; [k: string]: string };
}

export interface CreditPack {
  id: string;
  name: string;
  description: string;
  active: boolean;
  metadata: { type: string; creditAmount: string; [k: string]: string };
  prices: CreditPackPrice[];
}

export const CREDIT_PACKS: CreditPack[] = [
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

/**
 * Look up a pack and price by priceId.
 * Returns null if the priceId isn't recognised.
 */
export function findPackByPriceId(
  priceId: string
): { pack: CreditPack; price: CreditPackPrice } | null {
  for (const pack of CREDIT_PACKS) {
    const price = pack.prices.find((p) => p.id === priceId);
    if (price) return { pack, price };
  }
  return null;
}
