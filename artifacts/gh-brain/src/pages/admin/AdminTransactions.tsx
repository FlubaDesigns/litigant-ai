import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listAdminTransactions, issueRefund, type AdminTransaction } from "@/services/adminService";
import { formatDate, LoadError, TabSkeleton } from "./AdminShared";

export const SHORTFALL_TYPES = new Set(["usage_shortfall", "settlement_failure"]);

export function TransactionsTab() {
  const [filterType, setFilterType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [debouncedUserId, setDebouncedUserId] = useState("");
  const [refundTarget, setRefundTarget] = useState<AdminTransaction | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserId(filterUserId), 400);
    return () => clearTimeout(t);
  }, [filterUserId]);

  const { data: pages, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin-transactions", filterType, debouncedUserId],
    queryFn: ({pageParam}) => listAdminTransactions({
      type: filterType || undefined,
      userId: debouncedUserId || undefined,
      limit: 30, cursor: pageParam,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.hasMore && last.nextCursor ? last.nextCursor : undefined,
  });
  const records = pages?.pages.flatMap(page => page.transactions) ?? [];

  // Separate query for unresolved shortfalls — always runs regardless of filter
  const { data: shortfallData } = useQuery({
    queryKey: ["admin-shortfalls"],
    queryFn: () => listAdminTransactions({ type: "usage_shortfall", limit: 5 }),
    staleTime: 60_000,
  });
  const { data: settlementFailData } = useQuery({
    queryKey: ["admin-settlement-failures"],
    queryFn: () => listAdminTransactions({ type: "settlement_failure", limit: 5 }),
    staleTime: 60_000,
  });
  const shortfallCount = (shortfallData?.transactions?.length ?? 0) + (settlementFailData?.transactions?.length ?? 0);

  return (
    <div className="space-y-4">
      {shortfallCount > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-300">
            <span className="font-semibold">{shortfallCount} recent credit shortfall{shortfallCount !== 1 ? "s" : ""}</span>
            {" "}— sessions where the actual cost exceeded the user's available balance or settlement crashed.
            Filter by <code className="text-xs bg-amber-400/10 px-1 rounded">usage_shortfall</code> or <code className="text-xs bg-amber-400/10 px-1 rounded">settlement_failure</code> to review. Refunds apply only to collected usage charges.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterType}
          aria-label="Filter transactions by type"
          onChange={(e) => setFilterType(e.target.value)}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All types</option>
          <option value="purchase">Purchase</option>
          <option value="subscription_grant">Subscription grant</option>
          <option value="signup_bonus">Signup bonus</option>
          <option value="usage">Usage</option>
          <option value="refund">Refund</option>
          <option value="admin_adjustment">Admin adjustment</option>
          <option value="usage_shortfall">⚠ Usage shortfall</option>
          <option value="settlement_failure">⚠ Settlement failure</option>
        </select>
        <Input
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          placeholder="Filter by user ID…"
          aria-label="Filter transactions by user ID"
          className="h-11 w-full sm:w-52 text-sm font-mono"
        />
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh transactions">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isError && <LoadError onRetry={refetch} />}
      {isLoading ? (
        <TabSkeleton />
      ) : (
        <div className="row layout__split-2">
          {records.map((tx) => {
            const isShortfall = SHORTFALL_TYPES.has(tx.type ?? "");
            const typeLabel = tx.type?.replace(/_/g, " ") ?? "Transaction";
            return (
              <article
                key={tx.id}
                aria-label={`Transaction ${typeLabel}`}
                className={cn("lgt-card lgt-card--compact space-y-3", isShortfall && "border-amber-400/40 bg-amber-400/5")}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs capitalize", isShortfall && "border-amber-400/50 text-amber-400")}
                  >
                    {isShortfall && <AlertTriangle className="w-3 h-3 mr-1 shrink-0" aria-hidden="true" />}
                    {typeLabel}
                  </Badge>
                  {(tx.type === "usage" && (tx.amount ?? 0) < 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 shrink-0 text-xs gap-1"
                      onClick={() => setRefundTarget(tx)}
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      Refund
                    </Button>
                  )}
                </div>
                <dl className="space-y-3">
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Amount · credits</dt>
                      <dd className={cn("text-sm font-semibold tabular-nums break-words", (tx.amount ?? 0) > 0 ? "text-primary" : (tx.amount ?? 0) < 0 ? "text-destructive" : "text-foreground")}>
                        {(tx.amount ?? 0) > 0 ? "+" : ""}{tx.amount ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Balance after</dt>
                      <dd className="text-sm tabular-nums break-words">{tx.balanceAfter ?? "—"}</dd>
                    </div>
                  </div>
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Source</dt>
                      <dd className="text-sm break-words">{tx.source ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Date</dt>
                      <dd className="text-sm">{formatDate(tx.createdAt)}</dd>
                    </div>
                  </div>
                </dl>
                <details className="text-xs text-muted-foreground">
                  <summary className="min-h-11 py-3 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Details</summary>
                  <dl className="space-y-2 pb-2">
                    <div>
                      <dt>User ID</dt>
                      <dd className="font-mono break-all text-foreground">{tx.userId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Transaction ID</dt>
                      <dd className="font-mono break-all text-foreground">{tx.id}</dd>
                    </div>
                  </dl>
                </details>
              </article>
            );
          })}
          {!isError && !records.length && (
            <p className="py-12 text-center text-muted-foreground text-sm">No transactions found</p>
          )}
        </div>
      )}

      {hasNextPage && <Button variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
        {isFetchingNextPage ? "Loading…" : "Load more transactions"}
      </Button>}

      {refundTarget && (
        <RefundModal
          tx={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => { void qc.invalidateQueries({ queryKey: ["admin-transactions"] }); void qc.invalidateQueries({ queryKey: ["admin-users"] }); void qc.invalidateQueries({ queryKey: ["admin-user"] }); }}
        />
      )}
    </div>
  );
}

export function RefundModal({
  tx, onClose, onSuccess,
}: {
  tx: AdminTransaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(Math.abs(tx.amount ?? 0)));
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());

  const { mutate, isPending } = useMutation({
    mutationFn: () => issueRefund(tx.userId!, Number(amount), reason, tx.id, requestId),
    onSuccess: (data) => {
      toast.success(data.skipped ? "This refund was already processed." : `Refund issued. New balance: ${data.newBalance}`);
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Refund</DialogTitle>
          <DialogDescription>
            Refund credits to user <span className="font-mono text-foreground">{tx.userId}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount (credits)</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={Math.abs(tx.amount ?? 0)}
              step={1}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reason</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. poor result, system error"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutate()} disabled={!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Issue Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
