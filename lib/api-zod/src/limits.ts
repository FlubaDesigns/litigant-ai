import { z } from "zod";

/** The engine defines ten distinct debate roles. Admin settings can lower this ceiling. */
export const MAX_LITIGANTS = 10;
export const ADMIN_LIMIT_RANGES = {
  maxLitigants: { min: 2, max: MAX_LITIGANTS },
  overdraftLimit: { min: 0, max: 5000 },
} as const;
export const DEFAULT_PLATFORM_LIMITS = { maxLitigants: MAX_LITIGANTS, overdraftLimit: 25 };
export const PlatformLimitsSchema = z.object({
  maxLitigants: z.number().int().min(ADMIN_LIMIT_RANGES.maxLitigants.min).max(MAX_LITIGANTS),
  overdraftLimit: z.number().int().min(ADMIN_LIMIT_RANGES.overdraftLimit.min).max(ADMIN_LIMIT_RANGES.overdraftLimit.max),
});
export type PlatformLimits = z.infer<typeof PlatformLimitsSchema>;
export interface PlatformLimitSettings {
  limits: PlatformLimits;
  storedLimits?: Partial<PlatformLimits>;
  notices?: string[];
}
