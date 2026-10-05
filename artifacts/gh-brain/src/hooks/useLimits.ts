import { useQuery } from "@tanstack/react-query";
import { getLimits, type PlatformLimits } from "@/services/providerService";
import { CONFIGURATION_REFRESH } from "@/lib/queryClient";

const DEFAULT_LIMITS: PlatformLimits = {maxLitigants:10, overdraftLimit:25};

export function useLimits(): PlatformLimits {
  const {data} = useQuery({queryKey:["configuration", "limits"], queryFn:getLimits, ...CONFIGURATION_REFRESH});
  return data ?? DEFAULT_LIMITS;
}
