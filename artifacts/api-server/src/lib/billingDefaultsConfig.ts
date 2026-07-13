import { getFirestoreDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export interface BillingDefaults {
  /** Dollar amounts shown as quick-pick options for auto top-up */
  autoRefillAmounts: number[];
  /** Pre-selected dollar amount for new users */
  defaultAutoRefillAmount: number;
  /** Credits threshold that triggers an automatic top-up charge */
  defaultThresholdCredits: number;
  /** Credits threshold that shows a low-balance warning to the user */
  defaultWarningThresholdCredits: number;
  /** Credits granted to every new user on first verified sign-in */
  signupBonusCredits: number;
}

const STATIC_DEFAULTS: BillingDefaults = {
  autoRefillAmounts: [10, 20, 50, 100, 200],
  defaultAutoRefillAmount: 20,
  defaultThresholdCredits: 100,
  defaultWarningThresholdCredits: 200,
  signupBonusCredits: 500,
};

let _cache: BillingDefaults | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateBillingDefaultsCache(): void {
  _cache = null;
  _cacheExpiry = 0;
}

export async function getBillingDefaults(): Promise<BillingDefaults> {
  const now = Date.now();
  if (_cache !== null && now < _cacheExpiry) return _cache;

  const db = getFirestoreDb();
  if (!db) return STATIC_DEFAULTS;

  try {
    const doc = await db.collection("config").doc("billingDefaults").get();
    const data = doc.exists ? (doc.data() as Partial<BillingDefaults>) : {};
    const merged: BillingDefaults = { ...STATIC_DEFAULTS, ...data };
    _cache = merged;
    _cacheExpiry = now + CACHE_TTL_MS;
    return merged;
  } catch {
    return STATIC_DEFAULTS;
  }
}

export async function saveBillingDefaults(
  updates: Partial<BillingDefaults>
): Promise<BillingDefaults> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const current = await getBillingDefaults();
  const next: BillingDefaults = { ...current, ...updates };

  await db
    .collection("config")
    .doc("billingDefaults")
    .set({ ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  invalidateBillingDefaultsCache();
  return next;
}
