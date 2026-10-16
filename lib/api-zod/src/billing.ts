/** One conversion rate for displayed custom top-ups, checkout and payment validation. */
export const CREDITS_PER_DOLLAR = 100;
export const CREDIT_VALUE_USD = 1 / CREDITS_PER_DOLLAR;

export interface BillingDefaults {
  autoRefillAmounts: number[];
  defaultAutoRefillAmount: number;
  defaultThresholdCredits: number;
  defaultWarningThresholdCredits: number;
  signupBonusCredits: number;
  emailCreditWarningThreshold: number;
}

export const AUTO_REFILL_CONSENT_VERSION = 1;
