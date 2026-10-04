import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CourtConfig } from "@workspace/api-zod/session";

import { API_BASE } from "@/lib/apiUrl";
export function useSessionQuote(config: CourtConfig) {
  const key = JSON.stringify(config);
  const [settledKey, setSettledKey] = useState(key);
  useEffect(() => {
    const timer = setTimeout(() => setSettledKey(key), 350);
    return () => clearTimeout(timer);
  }, [key]);
  const query = useQuery({
    queryKey: ["session-quote", settledKey],
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<{config: CourtConfig; estimatedCredits: number; maxCredits: number}> => {
      const res = await fetch(`${API_BASE}/session-estimate`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({config: JSON.parse(settledKey)}), signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Estimate unavailable");
      return data;
    },
  });
  return {...query, ready: key === settledKey && !!query.data && !query.isError};
}
