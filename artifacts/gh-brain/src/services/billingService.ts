import { auth } from "@/lib/firebase";

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api-server/api";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export interface CreditTransaction {
  transactionId: string;
  userId: string;
  type: "purchase" | "subscription_grant" | "signup_bonus" | "usage" | "refund" | "admin_adjustment";
  amount: number;
  balanceAfter?: number;
  source?: string;
  sessionId?: string | null;
  stripePaymentId?: string | null;
  createdAt: string;
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

export interface BillingProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, string>;
  prices: StripePrice[];
}

export interface StripeSubscription {
  id: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
}

export async function getProducts(): Promise<BillingProduct[]> {
  try {
    const res = await fetch(`${API_BASE}/billing/products`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function getTransactions(
  cursor?: string
): Promise<{ items: CreditTransaction[]; nextCursor: string | null }> {
  try {
    const headers = await authHeaders();
    const url = cursor
      ? `${API_BASE}/billing/transactions?cursor=${cursor}`
      : `${API_BASE}/billing/transactions`;
    const res = await fetch(url, { headers });
    if (!res.ok) return { items: [], nextCursor: null };
    return res.json();
  } catch {
    return { items: [], nextCursor: null };
  }
}

export async function getSubscription(): Promise<StripeSubscription | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/billing/subscription`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.subscription ?? null;
  } catch {
    return null;
  }
}

export async function createCheckoutSession(priceId: string): Promise<string | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/billing/checkout`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error ?? "Failed to create checkout session");
    }
    const data = await res.json();
    return data.url ?? null;
  } catch (err: any) {
    throw err;
  }
}

export async function createPortalSession(): Promise<string | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/billing/portal`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error ?? "Failed to create portal session");
    }
    const data = await res.json();
    return data.url ?? null;
  } catch (err: any) {
    throw err;
  }
}
