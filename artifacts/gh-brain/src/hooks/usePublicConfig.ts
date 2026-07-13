import { useEffect, useState } from "react";
import { getBillingDefaults } from "@/services/billingService";
import type { BillingDefaults } from "@/services/billingService";

export interface PublicConfig {
  signupBonusCredits: number;
}

const FALLBACK: PublicConfig = { signupBonusCredits: 500 };

let _cached: PublicConfig | null = null;

export function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(_cached ?? FALLBACK);

  useEffect(() => {
    if (_cached) return;
    getBillingDefaults()
      .then((d: BillingDefaults) => {
        const c: PublicConfig = {
          signupBonusCredits: d.signupBonusCredits ?? 500,
        };
        _cached = c;
        setConfig(c);
      })
      .catch(() => {});
  }, []);

  return config;
}
