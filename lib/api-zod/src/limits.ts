import { z } from "zod";

/** The engine defines ten distinct debate roles. Admin settings can lower this ceiling. */
export const MAX_LITIGANTS = 10;
export const ADMIN_LIMIT_RANGES = {
  maxLitigants: { min: 2, max: MAX_LITIGANTS },
  overdraftLimit: { min: 0, max: 5000 },
  feedbackPerHour: { min: 1, max: 500 },
  caseFilesPerHour: { min: 1, max: 200 },
  extractionTimeoutSeconds: { min: 1, max: 60 },
} as const;
export const DEFAULT_PLATFORM_LIMITS = { maxLitigants: MAX_LITIGANTS, overdraftLimit: 25, feedbackPerHour: 60, caseFilesPerHour: 30, extractionTimeoutSeconds: 15 };
export const PlatformLimitsSchema = z.object({
  maxLitigants: z.number().int().min(ADMIN_LIMIT_RANGES.maxLitigants.min).max(MAX_LITIGANTS),
  overdraftLimit: z.number().int().min(ADMIN_LIMIT_RANGES.overdraftLimit.min).max(ADMIN_LIMIT_RANGES.overdraftLimit.max),
  feedbackPerHour: z.number().int().min(ADMIN_LIMIT_RANGES.feedbackPerHour.min).max(ADMIN_LIMIT_RANGES.feedbackPerHour.max).default(DEFAULT_PLATFORM_LIMITS.feedbackPerHour),
  caseFilesPerHour: z.number().int().min(ADMIN_LIMIT_RANGES.caseFilesPerHour.min).max(ADMIN_LIMIT_RANGES.caseFilesPerHour.max).default(DEFAULT_PLATFORM_LIMITS.caseFilesPerHour),
  extractionTimeoutSeconds: z.number().int().min(ADMIN_LIMIT_RANGES.extractionTimeoutSeconds.min).max(ADMIN_LIMIT_RANGES.extractionTimeoutSeconds.max).default(DEFAULT_PLATFORM_LIMITS.extractionTimeoutSeconds),
});
export type PlatformLimits = z.infer<typeof PlatformLimitsSchema>;
export interface PlatformLimitSettings {
  limits: PlatformLimits;
  storedLimits?: Partial<PlatformLimits>;
  notices?: string[];
}
