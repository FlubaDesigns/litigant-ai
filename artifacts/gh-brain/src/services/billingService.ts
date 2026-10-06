import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

import { API_BASE } from "@/lib/apiUrl";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function getCourtesyCredit(): Promise<{eligible:boolean;limit:number}> {
  const res = await fetch(`${API_BASE}/billing/courtesy-credit`, {headers:await authHeaders(), cache:"no-store"});
  if (!res.ok) throw new Error("Could not check courtesy credit");
  return res.json();
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
  paymentId?: string | null;
  createdAt: string;
}

export interface BillingPrice {
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
  prices: BillingPrice[];
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
    features: ["AI dialogue", "Free starter credits", "Paid credits unlock Pro features"],
  },
  pro: {
    label: "Pro",
    features: ["AI dialogue", "Templates and document creation", "Document downloads", "Public report sharing", "Saved conversation history"],
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

export async function getSubscription(): Promise<null> {
  return null;
}

/**
 * Called by authService after new user creation.
 * The server grants the admin-configured signup credits idempotently.
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
  dollarAmount?: number;
  warningThresholdCredits?: number;
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

export interface BillingDefaults {
  autoRefillAmounts: number[];
  defaultAutoRefillAmount: number;
  defaultThresholdCredits: number;
  defaultWarningThresholdCredits: number;
  signupBonusCredits: number;
}

export const STATIC_BILLING_DEFAULTS: BillingDefaults = {
  autoRefillAmounts: [10, 20, 50, 100, 200],
  defaultAutoRefillAmount: 20,
  defaultThresholdCredits: 100,
  defaultWarningThresholdCredits: 200,
  signupBonusCredits: 500,
};

/**
 * Fetches admin-configured billing defaults (auto-refill amounts, thresholds).
 */
export async function getBillingDefaults(): Promise<BillingDefaults> {
  const res = await fetch(`${API_BASE}/billing/defaults`, {cache:"no-store"});
  if (!res.ok) throw new Error("Unable to load billing defaults");
  return res.json();
}

/**
 * Creates a Square Payment Link and returns the checkout URL.
 * The user is redirected to Square's hosted checkout page.
 */
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
      throw new Error((err as any).error ?? "Failed to create checkout link");
    }
    const data = await res.json();
    return data.url ?? null;
  } catch (err: any) {
    throw err;
  }
}

/**
 * Creates a Square Payment Link for an arbitrary dollar amount.
 * Rate: 100 credits per dollar. Min $1, max $500.
 */
export async function createCustomCheckoutSession(
  dollars: number
): Promise<{ url: string; creditAmount: number } | null> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/billing/checkout/custom`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ dollars }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to create checkout link");
  }
  const data = await res.json();
  return { url: data.url, creditAmount: data.creditAmount };
}

/**
 * Not available — Square does not have a hosted billing portal.
 * Returns null so the UI can hide the portal button gracefully.
 */
export async function createPortalSession(): Promise<string | null> {
  return null;
}
