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
  /** Balance below which a low-credits warning email is sent (admin-configurable) */
  emailCreditWarningThreshold: number;
}

const STATIC_DEFAULTS: BillingDefaults = {
  autoRefillAmounts: [10, 20, 50, 100, 200],
  defaultAutoRefillAmount: 20,
  defaultThresholdCredits: 100,
  defaultWarningThresholdCredits: 200,
  signupBonusCredits: 500,
  emailCreditWarningThreshold: 100,
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
    const data = doc.exists ? (doc.data() as Record<string, unknown>) : {};

    const isPositiveInt = (v: unknown): v is number =>
      typeof v === "number" && Number.isInteger(v) && v >= 0;

    const autoRefillAmounts =
      Array.isArray(data.autoRefillAmounts) &&
      data.autoRefillAmounts.length > 0 &&
      (data.autoRefillAmounts as unknown[]).every(
        (a) => typeof a === "number" && Number.isInteger(a) && a >= 1 && a <= 500
      )
        ? (data.autoRefillAmounts as number[])
        : STATIC_DEFAULTS.autoRefillAmounts;

    const defaultAutoRefillAmount =
      isPositiveInt(data.defaultAutoRefillAmount) &&
      data.defaultAutoRefillAmount >= 1 &&
      data.defaultAutoRefillAmount <= 500
        ? data.defaultAutoRefillAmount
        : STATIC_DEFAULTS.defaultAutoRefillAmount;

    const defaultThresholdCredits =
      isPositiveInt(data.defaultThresholdCredits) &&
      data.defaultThresholdCredits <= 100_000
        ? data.defaultThresholdCredits
        : STATIC_DEFAULTS.defaultThresholdCredits;

    const defaultWarningThresholdCredits =
      isPositiveInt(data.defaultWarningThresholdCredits) &&
      data.defaultWarningThresholdCredits <= 100_000
        ? data.defaultWarningThresholdCredits
        : STATIC_DEFAULTS.defaultWarningThresholdCredits;

    const signupBonusCredits =
      isPositiveInt(data.signupBonusCredits) &&
      data.signupBonusCredits <= 100_000
        ? data.signupBonusCredits
        : STATIC_DEFAULTS.signupBonusCredits;

    const emailCreditWarningThreshold =
      isPositiveInt(data.emailCreditWarningThreshold) &&
      data.emailCreditWarningThreshold <= 100_000
        ? data.emailCreditWarningThreshold
        : STATIC_DEFAULTS.emailCreditWarningThreshold;

    const merged: BillingDefaults = {
      autoRefillAmounts,
      defaultAutoRefillAmount,
      defaultThresholdCredits,
      defaultWarningThresholdCredits,
      signupBonusCredits,
      emailCreditWarningThreshold,
    };
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
