import { QueryClient } from "@tanstack/react-query";

// The app's only query cache. Configuration uses the same cache as other API reads.
export const queryClient = new QueryClient({
  defaultOptions: {queries: {staleTime: 5 * 60_000, retry: 1}},
});

export const CONFIGURATION_REFRESH = {
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always" as const,
  refetchOnReconnect: "always" as const,
};

export function refreshConfiguration(): void {
  void queryClient.invalidateQueries({queryKey: ["configuration"]});
  void queryClient.invalidateQueries({queryKey: ["session-quote"]});
}
