import { sql } from "drizzle-orm";

let _db: any = null;

async function getDb() {
  if (!process.env["DATABASE_URL"]) return null;
  if (!_db) {
    try {
      const mod = await import("@workspace/db");
      _db = mod.db;
    } catch {
      return null;
    }
  }
  return _db;
}

export interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, string>;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  active: boolean;
  metadata: Record<string, string>;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  metadata: Record<string, string>;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  items: Array<{ price: { id: string; product: string } }>;
}

export interface PaymentHistoryItem {
  id: string;
  amount: number | null;
  currency: string;
  status: string;
  created: number;
  description: string | null;
}

export async function listProductsWithPrices(): Promise<
  Array<StripeProduct & { prices: StripePrice[] }>
> {
  const db = await getDb();
  if (!db) return [];

  try {
    const rows = await db.execute(sql`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.active AS product_active,
        p.metadata AS product_metadata,
        pr.id AS price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active AS price_active,
        pr.metadata AS price_metadata
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY p.name, pr.unit_amount
    `);

    const map = new Map<string, StripeProduct & { prices: StripePrice[] }>();
    for (const row of rows.rows ?? []) {
      const pid: string = row.product_id as string;
      if (!map.has(pid)) {
        map.set(pid, {
          id: pid,
          name: row.product_name as string,
          description: (row.product_description as string | null) ?? null,
          active: Boolean(row.product_active),
          metadata: (row.product_metadata as Record<string, string>) ?? {},
          prices: [],
        });
      }
      if (row.price_id) {
        map.get(pid)!.prices.push({
          id: row.price_id as string,
          product: pid,
          unit_amount: row.unit_amount as number | null,
          currency: (row.currency as string) ?? "usd",
          recurring:
            (row.recurring as { interval: string; interval_count: number } | null) ?? null,
          active: Boolean(row.price_active),
          metadata: (row.price_metadata as Record<string, string>) ?? {},
        });
      }
    }
    return Array.from(map.values());
  } catch (err) {
    console.warn("[StripeStorage] listProductsWithPrices error:", err);
    return [];
  }
}

export async function getPrice(priceId: string): Promise<StripePrice | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.execute(sql`
      SELECT id, product, unit_amount, currency, recurring, active, metadata
      FROM stripe.prices
      WHERE id = ${priceId}
    `);
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.id as string,
      product: row.product as string,
      unit_amount: row.unit_amount as number | null,
      currency: (row.currency as string) ?? "usd",
      recurring:
        (row.recurring as { interval: string; interval_count: number } | null) ?? null,
      active: Boolean(row.active),
      metadata: (row.metadata as Record<string, string>) ?? {},
    };
  } catch {
    return null;
  }
}

export async function findCustomerByUserId(userId: string): Promise<StripeCustomer | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.execute(sql`
      SELECT id, email, metadata
      FROM stripe.customers
      WHERE metadata->>'userId' = ${userId}
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      metadata: (row.metadata as Record<string, string>) ?? {},
    };
  } catch {
    return null;
  }
}

export async function getSubscriptionByCustomerId(
  customerId: string
): Promise<StripeSubscription | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.execute(sql`
      SELECT id, customer, status, current_period_end, cancel_at_period_end, items
      FROM stripe.subscriptions
      WHERE customer = ${customerId}
        AND status IN ('active', 'trialing', 'past_due')
      ORDER BY created DESC
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.id as string,
      customer: row.customer as string,
      status: row.status as string,
      current_period_end: row.current_period_end as number | null,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      items: (row.items as any[]) ?? [],
    };
  } catch {
    return null;
  }
}

export async function getPaymentHistory(
  customerId: string,
  limit = 20
): Promise<PaymentHistoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const result = await db.execute(sql`
      SELECT id, amount, currency, status, created, description
      FROM stripe.payment_intents
      WHERE customer = ${customerId}
        AND status = 'succeeded'
      ORDER BY created DESC
      LIMIT ${limit}
    `);
    return (result.rows ?? []).map((row: any) => ({
      id: row.id as string,
      amount: row.amount as number | null,
      currency: (row.currency as string) ?? "usd",
      status: (row.status as string) ?? "unknown",
      created: row.created as number,
      description: (row.description as string | null) ?? null,
    }));
  } catch (err) {
    console.warn("[StripeStorage] getPaymentHistory error:", err);
    return [];
  }
}
