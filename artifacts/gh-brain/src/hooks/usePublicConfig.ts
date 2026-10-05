import { useBillingDefaults } from "./useConfiguration";

export interface PublicConfig { signupBonusCredits: number | null; }

export function usePublicConfig(): PublicConfig {
  const {data} = useBillingDefaults();
  return {signupBonusCredits:data?.signupBonusCredits ?? null};
}
