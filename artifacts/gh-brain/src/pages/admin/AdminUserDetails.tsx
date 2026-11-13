import { accountAccess } from "@workspace/api-zod/session";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, Ban, Zap, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAdminUser, adjustUserCredits, banUser, setUserTestModel, listAdminSessions, getAdminSession, type AdminUser, type AdminSession } from "@/services/adminService";
import { formatDate } from "./AdminShared";

export function SessionTranscriptRow({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-session-detail", sessionId],
    queryFn: () => getAdminSession(sessionId),
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading transcript…
    </div>
  );

  if (!data) return <p className="text-xs text-muted-foreground py-2">No transcript available.</p>;

  const { session, turns } = data;

  return (
    <div className="mt-3 space-y-3">
      {session.question && (
        <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Full Question</p>
          <p className="text-sm text-foreground leading-relaxed">{session.question}</p>
        </div>
      )}
      {session.finalAnswer && (
        <div className="rounded-md bg-secondary/30 border border-border p-3">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Verdict</p>
          <p className="text-sm text-foreground leading-relaxed line-clamp-6">{session.finalAnswer}</p>
        </div>
      )}
      {turns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Transcript ({turns.length} turns)</p>
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {turns.map((t) => (
              <div key={t.id} className="rounded-md border border-border bg-background p-2.5">
                <p className="text-xs font-semibold text-primary mb-1">{t.role}{t.round != null && t.round > 0 ? ` · Round ${t.round}` : ""}</p>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-8">{t.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function UserSessionRow({ session }: { session: AdminSession }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background text-sm overflow-hidden">
      <button
        className="w-full text-left p-3 hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug flex-1 min-w-0">
            {session.question ?? session.title ?? "Untitled"}
          </p>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground mt-0.5" />}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">{formatDate(session.createdAt)}</span>
          {session.creditsUsed != null && (
            <span className="text-xs text-muted-foreground">{session.creditsUsed} cr</span>
          )}
          {session.confidence != null && session.confidence > 0 && (
            <span className="text-xs text-muted-foreground">{session.confidence}% conf</span>
          )}
          {session.status && session.status !== "complete" && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{session.status}</Badge>
          )}
          {session.shared && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-primary border-primary/30">shared</Badge>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          <SessionTranscriptRow sessionId={session.id} />
        </div>
      )}
    </div>
  );
}

export function UserProfileSheet({
  uid, onClose, onAdjust, onBan,
}: {
  uid: string;
  onClose: () => void;
  onAdjust: (u: AdminUser) => void;
  onBan: (u: AdminUser) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user", uid],
    queryFn: () => getAdminUser(uid),
  });

  const testModelMutation = useMutation({
    mutationFn: (opts: { provider: string; model: string } | null) =>
      setUserTestModel(uid, opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
      toast.success("Test model updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update test model"),
  });

  const {
    data: sessionsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: sessionsLoading,
  } = useInfiniteQuery({
    queryKey: ["admin-user-sessions", uid],
    queryFn: ({ pageParam }) =>
      listAdminSessions({ userId: uid, limit: 15, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.hasMore ? (last.nextCursor ?? undefined) : undefined,
  });

  const sessions = sessionsData?.pages.flatMap((p) => p.sessions) ?? [];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-admin-panel="" side="right" className="w-full sm:max-w-xl bg-card border-l border-border overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>User Profile</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="font-semibold">{data.user.displayName ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{data.user.email}</p>
              <p className="text-xs text-muted-foreground font-mono">{data.user.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Credits</p>
                <p className="font-mono font-bold text-primary">{data.user.creditBalance ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="font-mono font-bold uppercase">{accountAccess(data.user.plan).label}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="text-sm">{formatDate(data.user.createdAt)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={cn("text-sm font-semibold", data.user.banned ? "text-destructive" : "text-primary")}>
                  {data.user.banned ? "Banned" : "Active"}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAdjust(data.user)}>
                <Zap className="w-3.5 h-3.5" />Adjust credits
              </Button>
              <Button
                size="sm"
                variant={data.user.banned ? "outline" : "destructive"}
                className="gap-1.5"
                onClick={() => onBan(data.user)}
              >
                <Ban className="w-3.5 h-3.5" />
                {data.user.banned ? "Unban" : "Ban"}
              </Button>
            </div>

            {/* ── Test model override ── */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-2">
              <div className="admin-row flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Test Model</p>
                  {data.user.testModel ? (
                    <p className="text-sm font-semibold text-amber-400 mt-0.5">
                      {data.user.testProvider} / {data.user.testModel}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5">Not set — using defaults</p>
                  )}
                </div>
                {data.user.testModel ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-amber-400 border-amber-400/40 hover:bg-amber-400/10"
                    disabled={testModelMutation.isPending}
                    onClick={() => testModelMutation.mutate(null)}
                  >
                    {testModelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Clear"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-primary border-primary/40 hover:bg-primary/10"
                    disabled={testModelMutation.isPending}
                    onClick={() => testModelMutation.mutate({ provider: "gemini", model: "gemini-2.0-flash" })}
                  >
                    {testModelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enable gemini-2.0-flash"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Forces all session seats to use this model. Clears on next session reset.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Sessions
                {sessions.length > 0 && <span className="text-primary">{sessions.length}{hasNextPage ? "+" : ""}</span>}
              </p>
              {sessionsLoading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading sessions…
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No sessions yet.</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => <UserSessionRow key={s.id} session={s} />)}
                  {hasNextPage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</> : "Load more sessions"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {data.recentTransactions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Recent Transactions</p>
                {data.recentTransactions.map((tx) => (
                  <div key={tx.id} className="rounded-lg border border-border bg-background p-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground uppercase">{tx.type}</p>
                      <p className="text-xs text-muted-foreground">{tx.source}</p>
                    </div>
                    <span className={cn("font-mono font-semibold", (tx.amount ?? 0) > 0 ? "text-primary" : "text-destructive")}>
                      {(tx.amount ?? 0) > 0 ? "+" : ""}{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">User not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CreditAdjustModal({
  user, onClose, onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => { setSubmitted(true); return adjustUserCredits(user.id, Number(amount), reason || "admin_adjustment", requestId); },
    onSuccess: (data) => {
      toast.success(`Credits adjusted. New balance: ${data.newBalance}`);
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isValid = amount !== "" && Number.isSafeInteger(Number(amount)) && Number(amount) !== 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Credits</DialogTitle>
          <DialogDescription>
            User: <span className="font-medium text-foreground">{user.email ?? user.id}</span>
            <br />Current balance: <span className="font-mono text-primary">{user.creditBalance ?? 0}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount (positive = add, negative = deduct)</label>
            <Input
              type="number"
              value={amount}
              disabled={submitted}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50 or -10"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Input
              value={reason}
              maxLength={500}
              disabled={submitted}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. customer service adjustment"
            />
          </div>
        </div>
        <DialogFooter>
          {submitted && <p className="text-sm text-muted-foreground">Retry keeps the same request. Check the ledger before opening a new adjustment.</p>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutate()} disabled={!isValid || isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BanModal({
  user, toBanned, onClose, onSuccess,
}: {
  user: AdminUser;
  toBanned: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () => banUser(user.id, toBanned, reason || undefined),
    onSuccess: (data: any) => {
      if (data?.authWarning) {
        toast.warning(`Partial success — ${data.authWarning}`);
      } else {
        toast.success(toBanned ? "User banned." : "User unbanned.");
      }
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{toBanned ? "Ban User" : "Unban User"}</DialogTitle>
          <DialogDescription>
            {toBanned
              ? `Banning ${user.email ?? user.id} will disable their Firebase Auth account immediately.`
              : `Unbanning ${user.email ?? user.id} will re-enable their Firebase Auth account.`}
          </DialogDescription>
        </DialogHeader>
        {toBanned && (
          <div className="py-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Input
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. abuse, spam, TOS violation"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={toBanned ? "destructive" : "default"}
            onClick={() => mutate()}
            disabled={isPending}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {toBanned ? "Ban User" : "Unban User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
