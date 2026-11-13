import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getErrorLogs } from "@/services/adminService";
import { formatDateTime, TabSkeleton } from "./AdminShared";
import { SessionDetailSheet } from "./AdminSessions";

export function ErrorLogsTab() {
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-error-logs"], queryFn: getErrorLogs, retry: false,
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  if (isLoading) return <TabSkeleton />;
  if (isError || !data) return <div role="alert" className="lgt-card lgt-card--compact space-y-3">
    <p>Unable to load error records.</p><Button variant="outline" disabled={isFetching} onClick={() => refetch()}>Retry</Button>
  </div>;
  const entries = [
    ...data.logs.map(l => ({...l,source:"Historical API error"})),
    ...data.failedSessions.map(s => ({...s,source:"Session failure"})),
  ].sort((a,b)=>(b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{entries.length} error records shown{data.hasMore ? " · more available" : ""}</p>
      <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1" />{isFetching ? "Refreshing…" : "Refresh"}</Button>
    </div>
    <p className="text-xs text-muted-foreground">Latest failure per session, including failed resumes. A recovered session can still show its last failure. Historical API errors are included where available. This is not a complete history of every failed provider attempt.</p>
    {data.hasMore && <p role="status" className="text-xs text-amber-400">Showing up to 50 records from each source.</p>}
    {entries.length ? <div className="row layout__split-2">{entries.map(entry => <article key={`${entry.source}:${entry.id}`} aria-label={`Error ${entry.id}`} className="lgt-card lgt-card--compact space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className="text-xs text-destructive">{entry.source}</Badge>
        {entry.sessionId && <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setSelectedId(entry.sessionId!)}>Open session<ChevronRight className="w-4 h-4" /></Button>}
      </div>
      <p className="text-sm break-words">{entry.message ?? "No error description recorded."}</p>
      <dl className="row layout__split-2 layout--keep-columns">
        <div><dt className="text-xs text-muted-foreground mb-1">When</dt><dd className="text-xs">{formatDateTime(entry.createdAt)}</dd></div>
        <div><dt className="text-xs text-muted-foreground mb-1">Current status</dt><dd className="text-xs break-words">{entry.status ?? "Unknown"}</dd></div>
      </dl>
      <details className="text-xs text-muted-foreground"><summary className="min-h-11 py-3 cursor-pointer">Record details</summary>
        <p className="break-all">User: {entry.userId ?? "Unknown"}</p><p className="break-all">Session: {entry.sessionId ?? "Not recorded"}</p>
        {entry.model && <p className="break-all">Model: {entry.model}</p>}<p className="break-all">Record: {entry.id}</p>
      </details>
    </article>)}</div> : <p className="lgt-card lgt-card--compact text-sm text-muted-foreground">No recorded session failures or historical API errors found.</p>}
    {selectedId && <SessionDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />}
  </div>;
}
