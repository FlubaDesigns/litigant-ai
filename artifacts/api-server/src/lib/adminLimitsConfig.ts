import { getFirestoreDb } from "./firebaseAdmin.js";

export const DEFAULT_LIMITS: Record<string, number> = { maxLitigants: 10, overdraftLimit: 500 };
export const LIMIT_RANGES: Record<string, { min: number; max: number }> = {
  maxLitigants: { min: 2, max: 20 },
  overdraftLimit: { min: 0, max: 5000 },
};
export class LimitsUnavailableError extends Error {
  constructor() { super("Platform limits are temporarily unavailable. Please try again."); }
}

/** Shared by the public controls, quotes and actual session preparation. */
export async function getAdminLimits(): Promise<Record<string, number>> {
  const db = getFirestoreDb();
  if (!db) throw new LimitsUnavailableError();
  try {
    const doc = await db.collection("config").doc("adminLimits").get();
    const saved = doc.exists ? doc.data() ?? {} : {};
    const limits = { ...DEFAULT_LIMITS };
    for (const [name, range] of Object.entries(LIMIT_RANGES)) {
      const value = saved[name] ?? DEFAULT_LIMITS[name];
      if (!Number.isInteger(value) || value < range.min || value > range.max) throw new LimitsUnavailableError();
      limits[name] = value;
    }
    return limits;
  } catch { throw new LimitsUnavailableError(); }
}
