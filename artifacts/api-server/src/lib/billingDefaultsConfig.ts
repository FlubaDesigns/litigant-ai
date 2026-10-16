import { ConfigurationUnavailableError, loadConfiguration } from "./configurationError.js";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

import type { BillingDefaults } from "@workspace/api-zod/billing";
export type { BillingDefaults } from "@workspace/api-zod/billing";

const STATIC_DEFAULTS: BillingDefaults = {
  autoRefillAmounts: [10, 20, 50, 100, 200],
  defaultAutoRefillAmount: 20,
  defaultThresholdCredits: 100,
  defaultWarningThresholdCredits: 200,
  signupBonusCredits: 500,
  emailCreditWarningThreshold: 100,
};

export async function getBillingDefaults(): Promise<BillingDefaults> {
  const db = getFirestoreDb();
  if (!db) throw new ConfigurationUnavailableError("Billing settings");

  return loadConfiguration("Billing settings", async () => {
    const doc = await db.collection("config").doc("billingDefaults").get();
    const data = doc.exists ? (doc.data() as Record<string, unknown>) : {};
    // An absent override uses the declared default; an invalid saved value is an error.
    const values = Object.fromEntries(Object.entries(STATIC_DEFAULTS).map(([key,value]) =>
      [key, Object.hasOwn(data,key) ? data[key] : value])) as unknown as BillingDefaults;
    validateBillingDefaults(values);
    return values;
  });
}

export class InvalidBillingDefaultsError extends Error {}

function validateBillingDefaults(values: BillingDefaults): void {
  if (!Array.isArray(values.autoRefillAmounts) || values.autoRefillAmounts.length === 0 ||
      values.autoRefillAmounts.some(n => !Number.isInteger(n) || n < 1 || n > 500)) {
    throw new InvalidBillingDefaultsError("Top-up amounts must be whole dollars between $1 and $500.");
  }
  if (!Number.isInteger(values.defaultAutoRefillAmount) || !values.autoRefillAmounts.includes(values.defaultAutoRefillAmount)) {
    throw new InvalidBillingDefaultsError("Default charge must be one of the top-up amounts.");
  }
  for (const key of ["defaultThresholdCredits", "defaultWarningThresholdCredits", "signupBonusCredits", "emailCreditWarningThreshold"] as const) {
    if (!Number.isInteger(values[key]) || values[key] < 0 || values[key] > 100000) {
      throw new InvalidBillingDefaultsError(`${key} must be a whole number from 0 to 100,000.`);
    }
  }
}

export async function saveBillingDefaults(
  updates: Partial<BillingDefaults>
): Promise<BillingDefaults> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const current = await getBillingDefaults();
  const next: BillingDefaults = { ...current, ...updates };
  validateBillingDefaults(next);

  await db
    .collection("config")
    .doc("billingDefaults")
    .set({ ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return next;
}
