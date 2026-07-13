import { useState, useEffect } from "react";
import { getLimits, type PlatformLimits } from "@/services/providerService";

const DEFAULT_LIMITS: PlatformLimits = { maxLitigants: 10, overdraftLimit: 500 };

export function useLimits(): PlatformLimits {
  const [limits, setLimits] = useState<PlatformLimits>(DEFAULT_LIMITS);

  useEffect(() => {
    getLimits()
      .then(setLimits)
      .catch(() => setLimits(DEFAULT_LIMITS));
  }, []);

  return limits;
}
