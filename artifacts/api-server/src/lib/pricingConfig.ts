/** Persisted multiplier overrides. Resolution and all display projections live in providerCatalog.ts. */
import { z } from "zod";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { FieldValue, FieldPath } from "firebase-admin/firestore";

export const MultiplierSchema = z.number().finite().min(1).max(100);

interface PricingDoc {
  multipliers?: Record<string, number>;
  updatedAt?: unknown;
}

/** Read overrides for each new catalog; active runs retain their accepted snapshot. */
export async function getMultiplierOverrides(): Promise<Record<string, number>> {
  const db = getFirestoreDb();
  if (!db) return {};
  const doc = await db.collection("config").doc("pricing").get();
  return { ...((doc.data() as PricingDoc | undefined)?.multipliers ?? {}) };
}

// ── Admin write operations ────────────────────────────────────────────────────

/**
 * Saves a multiplier override to Firestore for the next catalog read.
 *
 * Uses merge:true so other overrides in the same document are untouched.
 *
 * @param model - Model ID validated against the catalog.
 * @param multiplier - New multiplier. Must be validated (1–100) before calling.
 */
export async function saveMultiplierOverride(model: string, multiplier: number): Promise<void> {
  const value = MultiplierSchema.parse(multiplier);
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  await db.collection("config").doc("pricing").set(
    { multipliers: { [model]: value }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/** Atomically removes just this override, preserving concurrent edits. */
export async function resetMultiplierToDefault(model: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");
  const ref = db.collection("config").doc("pricing");
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (doc.exists) tx.update(ref, new FieldPath("multipliers", model), FieldValue.delete(), "updatedAt", FieldValue.serverTimestamp());
  });
}
