import { useQuery } from "@tanstack/react-query";
import { getLimits, type PlatformLimits } from "@/services/providerService";
import { CONFIGURATION_REFRESH } from "@/lib/queryClient";

export function useLimits(): PlatformLimits | undefined {
  const {data} = useQuery({queryKey:["configuration", "limits"], queryFn:getLimits, ...CONFIGURATION_REFRESH});
  return data;
}
