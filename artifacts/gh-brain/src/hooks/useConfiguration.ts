import { useQuery } from "@tanstack/react-query";
import { CONFIGURATION_REFRESH } from "@/lib/queryClient";
import { getProviders } from "@/services/providerService";
import { getBillingDefaults } from "@/services/billingService";
import { fetchTemplates } from "@/services/templateService";

export function useProviders(enabled = true) {
  return useQuery({queryKey:["configuration", "providers"], queryFn:getProviders, ...CONFIGURATION_REFRESH, enabled});
}

export function useBillingDefaults() {
  return useQuery({queryKey:["configuration", "billing-defaults"], queryFn:getBillingDefaults, ...CONFIGURATION_REFRESH});
}

export function useTemplates() {
  return useQuery({queryKey:["configuration", "templates"], queryFn:fetchTemplates, ...CONFIGURATION_REFRESH});
}
