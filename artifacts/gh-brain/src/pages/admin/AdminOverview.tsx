import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, Brain, CreditCard, Activity, Clock, RefreshCw, TrendingUp, AlertCircle, ThumbsDown, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAdminStats, getSystemHealth, getApiUsage } from "@/services/adminService";
import { StatCard, TabSkeleton } from "./AdminShared";

export function ConversationAverage() {
  const {data, isLoading, isError} = useQuery({queryKey:["admin-api-usage"], queryFn:getApiUsage, retry:false});
  return <section className="lgt-card lgt-card--compact space-y-2 mb-4" aria-label="Average conversation credits">
    <p className="text-sm font-medium">Average conversation</p>
    <p className="text-lg font-semibold">{isLoading ? "Loading…" : isError ? "Unavailable" : data?.averageConversationCredits == null ? "No completed conversations yet" : `${data.averageConversationCredits.toLocaleString(undefined, {maximumFractionDigits:1})} credits`}</p>
    {data && <p className="text-xs text-muted-foreground">{data.completedSessionCount ?? 0} completed conversations · started in the last 30 days{data.truncated ? " · partial report (latest 1,000 sessions)" : ""}{data.completedSessionsMissingCredits ? ` · ${data.completedSessionsMissingCredits} excluded without recorded credits` : ""}.</p>}
    <p className="text-xs text-muted-foreground">Actual recorded credits. The courtesy ceiling only changes when you save it.</p>
  </section>;
}

export function OverviewTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getAdminStats,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;
  const value = (count: number | undefined) => isError && !data ? "—" : count ?? 0;

  return (
    <div>
      <Button asChild variant="outline" className="mb-4 min-h-11">
        <Link href="/admin?tab=checklist"><ListChecks className="mr-2 h-4 w-4" />To-do list</Link>
      </Button>
      <ConversationAverage />
      {isError && !data && <p role="alert" className="text-sm text-amber-400 mb-4">Unable to load statistics.</p>}
      <div className="row layout__split-2 layout--keep-columns">
        <StatCard label="Total Users" value={value(data?.userCount)} icon={Users} />
        <StatCard label="Sessions" value={value(data?.sessionCount)} icon={Brain} />
      </div>
      <div className="row layout__split-2 layout--keep-columns">
        <StatCard label="Transactions" value={value(data?.txCount)} icon={CreditCard} />
        <StatCard label="Last 7 Days" value={value(data?.recentSessions)} icon={TrendingUp} sub="new sessions" />
      </div>
    </div>
  );
}

export function SystemHealthTab() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: getSystemHealth,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data || data.status === "unavailable") {
    return (
      <div className="lgt-card lgt-card--compact space-y-3">
        <p role="alert" className="text-sm text-amber-400">System health unavailable.</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const { collections, last24h, last7d, serverTime } = data;
  const count = (value: number | null | undefined) => value ?? "Unavailable";
  const errorRate = last7d?.errorRate != null ? `${last7d.errorRate}%`
    : last7d?.activeSessions === 0 ? "—" : "Unavailable";

  return (
    <div>
      <div className="admin-row flex items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          Updated {serverTime ? new Date(serverTime).toLocaleString() : "—"}
        </p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isFetching && "animate-spin")} />Refresh
        </Button>
      </div>
      {data.status === "degraded" && <p role="alert" className="text-sm text-amber-400 mb-4">Error metrics unavailable.</p>}
      <div className="row layout__split-2 layout--keep-columns">
        <StatCard label="Users" value={count(collections?.users)} icon={Users} />
        <StatCard label="Sessions" value={count(collections?.sessions)} icon={Brain} />
      </div>
      <div className="row layout__split-2 layout--keep-columns">
        <StatCard label="Transactions" value={count(collections?.credit_transactions)} icon={CreditCard} />
        <StatCard label="New · 24 hours" value={count(last24h?.newSessions)} icon={Clock} />
      </div>
      <h3 className="text-sm font-semibold mb-3">Last 7 days</h3>
      <div className="row layout__split-2 layout--keep-columns">
        <StatCard label="Sessions with errors" value={count(last7d?.errorSessions)} icon={AlertCircle} />
        <StatCard label="Error rate" value={errorRate} icon={TrendingUp} />
      </div>
      <div className="row layout__split-2 layout--keep-columns">
        <StatCard label="Active sessions" value={count(last7d?.activeSessions)} icon={Activity} />
        <StatCard label="Feedback" value={count(last7d?.feedbackEntries)} icon={ThumbsDown} />
      </div>
    </div>
  );
}

export function ApiUsageTab() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-api-usage"], queryFn: getApiUsage, retry: false,
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const money = (n:number) => n > 0 && n < .0001 ? "<$0.0001" : `$${n.toFixed(4)}`;
  const count = (n:number) => n.toLocaleString();
  if (isLoading) return <TabSkeleton />;
  if (isError || !data) return <div role="alert" className="lgt-card lgt-card--compact space-y-3">
    <p>Unable to load API usage.</p>
    <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>Retry</Button>
  </div>;
  const incomplete = data.sessionsMissingCallDetails > 0 || data.unpricedCalls > 0;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Sessions started in the last 30 days · UTC</p>
      <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
        <RefreshCw className={cn("w-4 h-4 mr-1", isFetching && "animate-spin")} />{isFetching ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">{data.since.slice(0, 16).replace("T", " ")} – {data.through.slice(0, 16).replace("T", " ")} UTC. Includes saved activity from resumed sessions in this group. Older sessions are excluded.</p>
    {data.truncated && <p role="status" className="text-sm text-amber-400">Partial report: showing the latest {count(data.limit)} sessions in this period.</p>}
    <div className="lgt-card lgt-card--compact">
      <dl className="space-y-3">
        <div className="row layout__split-2 layout--keep-columns">
          <div><dt className="text-xs text-muted-foreground mb-1">Recorded API cost{incomplete ? " · partial" : ""}</dt><dd className="text-lg font-semibold text-primary break-words">{money(data.costUSD)}</dd></div>
          <div><dt className="text-xs text-muted-foreground mb-1">Customer credits{data.sessionsMissingCredits ? " · partial" : ""}</dt><dd className="text-lg font-semibold break-words">{count(data.totalCreditsUsed)}</dd></div>
        </div>
        <div className="row layout__split-2 layout--keep-columns">
          <div><dt className="text-xs text-muted-foreground mb-1">Sessions</dt><dd className="text-sm">{count(data.totalSessions)}</dd></div>
          <div><dt className="text-xs text-muted-foreground mb-1">Recorded model calls</dt><dd className="text-sm">{count(data.totalCalls)}</dd></div>
        </div>
        <div className="row layout__split-2 layout--keep-columns">
          <div><dt className="text-xs text-muted-foreground mb-1">Input tokens</dt><dd className="text-sm">{count(data.totalInputTokens)}</dd></div>
          <div><dt className="text-xs text-muted-foreground mb-1">Output tokens</dt><dd className="text-sm">{count(data.totalOutputTokens)}</dd></div>
        </div>
      </dl>
    </div>
    <details className="lgt-card lgt-card--compact text-xs text-muted-foreground">
      <summary className="min-h-11 py-3 cursor-pointer">What these totals include</summary>
      <p>API cost uses the rates saved with each call, before your multiplier. It is not a provider invoice. Customer credits are the charges saved with these sessions after settlement; later manual refunds are shown in Transactions. Calls that failed before usage could be saved are not included.</p>
      <p className="mt-2">Input tokens include cached input and cache writes. Cache counts below are subsets, not extra tokens.</p>
    </details>
    {(incomplete || data.estimatedCalls > 0 || data.sessionsMissingCredits > 0) && <div role="status" className="lgt-card lgt-card--compact text-xs text-amber-400 space-y-1">
      {data.sessionsMissingCallDetails > 0 && <p>{count(data.sessionsMissingCallDetails)} sessions have no recorded call details. Their model usage and API costs are unavailable.</p>}
      {data.unpricedCalls > 0 && <p>{count(data.unpricedCalls)} calls have no saved price and are excluded from API cost.</p>}
      {data.estimatedCalls > 0 && <p>{count(data.estimatedCalls)} calls use estimated or unconfirmed token counts.</p>}
      {data.sessionsMissingCredits > 0 && <p>{count(data.sessionsMissingCredits)} sessions have no saved credit total.</p>}
    </div>}
    <h3 className="text-sm font-semibold">Usage by provider and model</h3>
    {data.byModel.length ? <div className="row layout__split-2">
      {data.byModel.map(m => <article key={JSON.stringify([m.provider,m.model])} aria-label={`Usage for ${m.provider} ${m.model}`} className="lgt-card lgt-card--compact space-y-3">
        <div><p className="text-xs text-muted-foreground break-words">{m.provider}</p><h4 className="text-sm font-semibold break-all">{m.model}</h4></div>
        <dl className="space-y-3">
          <div className="row layout__split-2 layout--keep-columns">
            <div><dt className="text-xs text-muted-foreground mb-1">Calls</dt><dd className="text-sm">{count(m.calls)}</dd></div>
            <div><dt className="text-xs text-muted-foreground mb-1">API cost{m.unpricedCalls ? " · partial" : ""}</dt><dd className="text-sm font-semibold text-primary break-words">{money(m.costUSD)}</dd></div>
          </div>
          <div className="row layout__split-2 layout--keep-columns">
            <div><dt className="text-xs text-muted-foreground mb-1">Input tokens</dt><dd className="text-sm">{count(m.inputTokens)}</dd></div>
            <div><dt className="text-xs text-muted-foreground mb-1">Output tokens</dt><dd className="text-sm">{count(m.outputTokens)}</dd></div>
          </div>
        </dl>
        <details className="text-xs text-muted-foreground">
          <summary className="min-h-11 py-3 cursor-pointer">Cache &amp; accuracy details</summary>
          <p>Cached input: {count(m.cachedInputTokens)} tokens</p>
          <p>Cache writes (standard): {count(m.cacheWriteTokens)} tokens</p>
          <p>Cache writes (1-hour): {count(m.cacheWrite1hTokens)} tokens</p>
          <p>Estimated or unconfirmed usage: {count(m.estimatedCalls)} calls</p>
          <p>Missing saved price: {count(m.unpricedCalls)} calls</p>
        </details>
      </article>)}
    </div> : <p className="lgt-card lgt-card--compact text-sm text-muted-foreground">No recorded model calls for these sessions.</p>}
    {!!data.byDay.length && <details className="lgt-card lgt-card--compact text-sm">
      <summary className="min-h-11 py-3 cursor-pointer">Sessions by start date</summary>
      <div className="divide-y divide-border">{data.byDay.map(day => <div key={day.date} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
        <span>{day.date}</span><span>{count(day.sessions)} sessions · {count(day.creditsUsed)} credits</span>
      </div>)}</div>
    </details>}
  </div>;
}
