import { useBillingDefaults } from "./useConfiguration";
import { STATIC_BILLING_DEFAULTS } from "@/services/billingService";

export interface PublicConfig { signupBonusCredits: number; }

export function usePublicConfig(): PublicConfig {
  const {data} = useBillingDefaults();
  return {signupBonusCredits:data?.signupBonusCredits ?? STATIC_BILLING_DEFAULTS.signupBonusCredits};
}
