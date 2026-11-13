import { useState, useEffect } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { listAdminSessions, getAdminSession, type AdminSession, type SessionTurn } from "@/services/adminService";
import { formatDate, formatDateTime, LoadError, TabSkeleton } from "./AdminShared";

export function SessionsTab() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterTemplateId, setFilterTemplateId] = useState("");
  const [debouncedUserId, setDebouncedUserId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserId(filterUserId), 400);
    return () => clearTimeout(t);
  }, [filterUserId]);

  const { data: pages, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin-sessions", filterStatus, debouncedUserId, filterTemplateId],
    queryFn: ({pageParam}) => listAdminSessions({
      status: filterStatus || undefined,
      userId: debouncedUserId || undefined,
      templateId: filterTemplateId || undefined,
      limit: 25, cursor: pageParam,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.hasMore && last.nextCursor ? last.nextCursor : undefined,
  });
  const records = pages?.pages.flatMap(page => page.sessions) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterStatus}
          aria-label="Filter sessions by status"
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="complete">Complete</option>
          <option value="incomplete">Incomplete</option>
          <option value="error">Error</option>
          <option value="relay_needed">Waiting for answers</option>
          <option value="paused_credit_cap">Paused for credits</option>
          <option value="running">Running</option>
        </select>
        <Input
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          placeholder="Filter by user ID…"
          aria-label="Filter sessions by user ID"
          className="h-11 w-full sm:w-52 text-sm font-mono"
        />
        <Input
          value={filterTemplateId}
          onChange={(e) => setFilterTemplateId(e.target.value)}
          placeholder="Filter by template ID…"
          aria-label="Filter sessions by template ID"
          className="h-11 w-full sm:w-48 text-sm font-mono"
        />
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh sessions">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isError && <LoadError onRetry={refetch} />}
      {isLoading ? (
        <TabSkeleton />
      ) : (
        <div className="row layout__split-2">
          {records.map((s) => {
            const title = s.title ?? s.question ?? "Untitled";
            return (
              <article key={s.id} className="lgt-card lgt-card--compact space-y-3" aria-label={`Session ${title}`}>
                <button
                  type="button"
                  className="flex items-start gap-2 w-full text-left rounded-md hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelectedId(s.id)}
                  aria-label={`Open session: ${title}`}
                >
                  <span className="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-3 break-words">{title}</span>
                  <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
                <dl className="space-y-3">
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Status</dt>
                      <dd>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            s.status === "complete"
                              ? "text-primary border-primary/30 bg-primary/10"
                              : s.status === "error"
                                ? "text-destructive border-destructive/30"
                                : "text-amber-400 border-amber-400/30"
                          )}
                        >
                          {s.status ?? "—"}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Confidence</dt>
                      <dd className="text-sm tabular-nums">{s.confidence != null ? `${s.confidence}%` : "—"}</dd>
                    </div>
                  </div>
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Credits</dt>
                      <dd className="text-sm tabular-nums">{s.creditsUsed ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Created</dt>
                      <dd className="text-sm">{formatDate(s.createdAt)}</dd>
                    </div>
                  </div>
                </dl>
              </article>
            );
          })}
          {!isError && !records.length && (
            <p className="py-12 text-center text-muted-foreground text-sm">No sessions found</p>
          )}
        </div>
      )}

      {hasNextPage && <Button variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
        {isFetchingNextPage ? "Loading…" : "Load more sessions"}
      </Button>}

      {selectedId && (
        <SessionDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

export function TurnCard({ turn }: { turn: SessionTurn }) {
  const [expanded, setExpanded] = useState(false);
  const content = turn.content ?? "";
  const isLong = content.length > 500;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-mono text-primary mb-1">
        {turn.role} · Round {turn.round}
      </p>
      <p className="text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">
        {isLong && !expanded ? content.slice(0, 500) : content}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-1 text-xs font-mono text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? "▲ Show less" : `▼ Show full (${content.length} chars)`}
        </button>
      )}
    </div>
  );
}

export function AgentCosts({ session }: { session: AdminSession }) {
  const calls = session.callUsage ?? [];
  const groups = new Map<string, { seat: string; model: string; cost: number; missing: boolean; estimated: boolean; unverified: boolean }>();
  for (const call of calls) {
    const seat = call.seat ?? "Unassigned (legacy)";
    const key = `${seat}/${call.provider}/${call.model}`;
    const row = groups.get(key) ?? {seat, model:call.model, cost:0, missing:false, estimated:false, unverified:false};
    row.cost += call.costUSD ?? 0;
    row.missing ||= call.costUSD === undefined;
    row.estimated ||= call.usageSource !== "provider";
    row.unverified ||= !call.rateVerifiedAt;
    groups.set(key, row);
  }
  return <section className="space-y-2" aria-label="Agent costs">
    <h3 className="font-semibold">Agent costs</h3>
    <p className="text-xs text-muted-foreground">Calculated API cost · USD</p>
    {groups.size ? [...groups].map(([key, row]) => <div key={key} className="flex justify-between items-start gap-3 border-b border-border py-2">
      <div className="min-w-0"><p>{row.seat}</p><p className="text-xs text-muted-foreground break-all">{row.model}</p>
        <p className="text-xs text-muted-foreground">{row.estimated ? "Estimated tokens" : "Provider token counts"}{row.unverified ? " · Unverified rate" : ""}</p></div>
      <span className="shrink-0 font-mono">{row.missing ? "Unavailable" : `$${row.cost.toFixed(5)}`}</span>
    </div>) : <p className="text-xs text-muted-foreground">Per-agent usage was not recorded for this session.</p>}
    {session.costUSD !== undefined && <p className="text-sm">Session total: <strong>${session.costUSD.toFixed(5)}</strong></p>}
    <p className="text-xs text-muted-foreground">Not reconciled to provider invoices.</p>
  </section>;
}

export function SessionDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-session", id],
    queryFn: () => getAdminSession(id),
  });
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-admin-panel="" side="right" className="w-full sm:max-w-xl bg-card border-l border-border overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Session Detail</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4 text-sm">
            <p className="font-semibold leading-snug">{data.session.title ?? data.session.question}</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-secondary/30 rounded p-2">
                <p className="text-muted-foreground">Status</p>
                <p>{data.session.status ?? "—"}</p>
              </div>
              <div className="bg-secondary/30 rounded p-2">
                <p className="text-muted-foreground">Confidence</p>
                <p>{data.session.confidence != null ? `${data.session.confidence}%` : "—"}</p>
              </div>
              <div className="bg-secondary/30 rounded p-2">
                <p className="text-muted-foreground">Credits Used</p>
                <p>{data.session.creditsUsed ?? "—"}</p>
              </div>
              <div className="bg-secondary/30 rounded p-2">
                <p className="text-muted-foreground">Created</p>
                <p>{formatDateTime(data.session.createdAt)}</p>
              </div>
            </div>

            {data.session.userId && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-xs font-mono break-all">{data.session.userId}</p>
              </div>
            )}

            <AgentCosts session={data.session} />

            {data.session.finalAnswer && (
              <div className="space-y-1">
                <p className="text-xs font-mono text-primary uppercase tracking-wider">Verdict</p>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {data.session.finalAnswer}
                </div>
              </div>
            )}

            {data.turns.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowTranscript((p) => !p)}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showTranscript ? "Hide" : "Show"} {data.turns.length} transcript turns
                </button>
                {showTranscript && (
                  <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                    {data.turns.map((turn) => (
                      <TurnCard key={turn.id} turn={turn} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Session not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
