import { useQuery } from "@tanstack/react-query";
import { getFeatureFlags } from "@/services/adminService";
import { CONFIGURATION_REFRESH } from "@/lib/queryClient";

/** Active consumers share one refreshing query; failed refreshes retain the last good value. */
export function useFeatureFlag(name: string): boolean {
  const {data} = useQuery({queryKey:["configuration", "feature-flags"], queryFn:getFeatureFlags, ...CONFIGURATION_REFRESH});
  return data?.[name] === true;
}
