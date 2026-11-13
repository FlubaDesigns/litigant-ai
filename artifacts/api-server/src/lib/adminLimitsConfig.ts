import { getFirestoreDb } from "./firebaseAdmin.js";
import { ADMIN_LIMIT_RANGES, DEFAULT_PLATFORM_LIMITS, PlatformLimitsSchema, type PlatformLimitSettings } from "@workspace/api-zod/limits";

export const DEFAULT_LIMITS: Record<string, number> = DEFAULT_PLATFORM_LIMITS;
export const LIMIT_RANGES: Record<string, {min: number; max: number}> = ADMIN_LIMIT_RANGES;
export class LimitsUnavailableError extends Error {
  constructor() { super("Platform limits are temporarily unavailable. Please try again."); }
}

/** One validated saved limit schema for controls, quotes and execution. */
export async function getAdminLimitSettings(): Promise<PlatformLimitSettings> {
  const db = getFirestoreDb();
  if (!db) throw new LimitsUnavailableError();
  try {
    const doc = await db.collection("config").doc("adminLimits").get();
    const saved = doc.exists ? doc.data() ?? {} : {};
    const raw = {...Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, value]) => [key, saved[key] ?? value])),
      maxLitigants:saved.maxLitigants ?? DEFAULT_LIMITS.maxLitigants,
      overdraftLimit:saved.overdraftLimit ?? DEFAULT_LIMITS.overdraftLimit};
    return {limits: PlatformLimitsSchema.parse(raw)};
  } catch { throw new LimitsUnavailableError(); }
}

/** Shared by public controls, quotes and execution; no cache can hide a saved change. */
export async function getAdminLimits(): Promise<Record<string, number>> {
  return (await getAdminLimitSettings()).limits;
}
