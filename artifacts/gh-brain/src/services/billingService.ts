import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

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
  type:
    | "purchase"
    | "subscription_grant"
    | "signup_bonus"
    | "usage"
    | "refund"
    | "admin_adjustment";
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

export interface PaymentHistoryItem {
  id: string;
  amount: number | null;
  currency: string;
  status: string;
  created: number;
  description: string | null;
}

export const PLAN_LIMITS = {
  free: {
    label: "Free",
    trialCredits: 50,
    creditsPerMonth: null,
    features: [
      "50 trial credits included",
      "Standard AI models",
      "Export to Markdown",
      "Session history (last 10)",
    ],
  },
  pro: {
    label: "Pro",
    trialCredits: null,
    creditsPerMonth: 2000,
    features: [
      "2,000 credits per month",
      "Priority AI model access",
      "Unlimited session history",
      "Advanced export options",
      "Early access to new features",
    ],
  },
} as const;

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

export async function getPaymentHistory(): Promise<PaymentHistoryItem[]> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/billing/payment-history`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
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

/**
 * Called by authService after new user creation.
 * The server grants 50 trial credits idempotently — the amount is entirely
 * controlled server-side and protected by an idempotency key.
 */
export async function grantSignupBonus(user: User): Promise<void> {
  try {
    const token = await user.getIdToken();
    await fetch(`${API_BASE}/billing/signup-grant`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn("[BillingService] signup-grant failed:", err);
  }
}

/**
 * Persist auto-refill preference to the server (Firestore-backed).
 */
export async function setAutoRefill(opts: {
  enabled: boolean;
  thresholdCredits?: number;
  packPriceId?: string;
}): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/billing/auto-refill`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update auto-refill preference");
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
