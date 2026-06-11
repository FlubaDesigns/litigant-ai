import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users, Brain, CreditCard, Activity, Flag, LayoutTemplate,
  Search, ChevronRight, MoreHorizontal, Loader2, Shield,
  Ban, Zap, Clock, Target, RefreshCw, Check, X, Edit3,
  AlertTriangle, TrendingUp, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getAdminStats, listAdminUsers, getAdminUser, adjustUserCredits, banUser,
  listAdminSessions, getAdminSession, listAdminTransactions, issueRefund,
  getFeatureFlags, setFeatureFlag, listAdminTemplates, updateAdminTemplate,
  type AdminUser, type AdminSession, type AdminTransaction,
} from "@/services/adminService";
import { invalidateFeatureFlagCache } from "@/hooks/useFeatureFlag";

type AdminTab = "overview" | "users" | "sessions" | "transactions" | "flags" | "templates";

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",      icon: Activity },
  { id: "users",        label: "Users",          icon: Users },
  { id: "sessions",     label: "Sessions",       icon: Brain },
  { id: "transactions", label: "Transactions",   icon: CreditCard },
  { id: "flags",        label: "Feature Flags",  icon: Flag },
  { id: "templates",    label: "Templates",      icon: LayoutTemplate },
];

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, sub,
}: { label: string; value: string | number; icon: React.ElementType; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── System Notes Card ────────────────────────────────────────────────────────
function SystemNotesCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Database className="w-4 h-4" />
        System Notes
      </p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          Admin routes enforce Firebase custom claim <code className="text-xs bg-secondary px-1 rounded">admin: true</code>
        </li>
        <li className="flex items-start gap-2">
          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          All credit mutations write an immutable <code className="text-xs bg-secondary px-1 rounded">credit_transactions</code> ledger entry
        </li>
        <li className="flex items-start gap-2">
          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          Ban toggles both Firestore flag and Firebase Auth disabled state
        </li>
        <li className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          Stripe webhook auto-refill not yet wired into usage flow — manual refund available below
        </li>
      </ul>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getAdminStats,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError && !data) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Firebase is not configured — admin data is unavailable in dev mode. Stats will show zeros.
            Connect Firebase to see real data.
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {["Total Users", "Sessions", "Transactions", "Last 7 Days"].map((l) => (
            <div key={l} className="rounded-xl border border-border bg-card p-5 opacity-40">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{l}</p>
              <p className="text-2xl font-bold font-mono mt-2">—</p>
            </div>
          ))}
        </div>
        <SystemNotesCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users"   value={data?.userCount ?? 0}        icon={Users}    />
        <StatCard label="Sessions"      value={data?.sessionCount ?? 0}      icon={Brain}    />
        <StatCard label="Transactions"  value={data?.txCount ?? 0}           icon={CreditCard} />
        <StatCard label="Last 7 Days"   value={data?.recentSessions ?? 0}    icon={TrendingUp} sub="new sessions" />
      </div>

      <SystemNotesCard />
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdminUser | null>(null);
  const [banTarget, setBanTarget] = useState<{ user: AdminUser; banned: boolean } | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-users", debouncedSearch],
    queryFn: () => listAdminUsers({ search: debouncedSearch || undefined, limit: 25 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((user) => (
                <TableRow key={user.id} className="hover:bg-secondary/20 cursor-pointer" onClick={() => setSelectedUid(user.id)}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{user.displayName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{user.email ?? user.id}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-mono uppercase">
                      {user.plan ?? "free"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{user.creditBalance ?? 0}</TableCell>
                  <TableCell>
                    {user.banned ? (
                      <Badge variant="destructive" className="text-xs">Banned</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-primary border-primary/30 bg-primary/10">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedUid(user.id)}>
                          <ChevronRight className="w-4 h-4 mr-2" />View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAdjustTarget(user)}>
                          <Zap className="w-4 h-4 mr-2" />Adjust credits
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={user.banned ? "text-primary" : "text-destructive"}
                          onClick={() => setBanTarget({ user, banned: !user.banned })}
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          {user.banned ? "Unban" : "Ban"} user
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!data?.users?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* User Profile Sheet */}
      {selectedUid && (
        <UserProfileSheet
          uid={selectedUid}
          onClose={() => setSelectedUid(null)}
          onAdjust={(user) => setAdjustTarget(user)}
          onBan={(user) => setBanTarget({ user, banned: !user.banned })}
        />
      )}

      {/* Credit Adjustment Modal */}
      {adjustTarget && (
        <CreditAdjustModal
          user={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            qc.invalidateQueries({ queryKey: ["admin-user", adjustTarget.id] });
          }}
        />
      )}

      {/* Ban Confirm Modal */}
      {banTarget && (
        <BanModal
          user={banTarget.user}
          toBanned={banTarget.banned}
          onClose={() => setBanTarget(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
        />
      )}
    </div>
  );
}

function UserProfileSheet({
  uid, onClose, onAdjust, onBan,
}: {
  uid: string;
  onClose: () => void;
  onAdjust: (u: AdminUser) => void;
  onBan: (u: AdminUser) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user", uid],
    queryFn: () => getAdminUser(uid),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-l border-border overflow-y-auto">
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
                <p className="font-mono font-bold uppercase">{data.user.plan ?? "free"}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Subscription</p>
                <p className="text-sm">{data.user.subscriptionStatus ?? "none"}</p>
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

            {data.recentSessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Recent Sessions</p>
                {data.recentSessions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                    <p className="font-medium truncate">{s.title ?? s.question?.slice(0, 60) ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{formatDate(s.createdAt)}</span>
                      {s.creditsUsed != null && <span>{s.creditsUsed} credits</span>}
                      {s.confidence != null && s.confidence > 0 && <span>{s.confidence}% conf</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}

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

function CreditAdjustModal({
  user, onClose, onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () => adjustUserCredits(user.id, Number(amount), reason || "admin_adjustment"),
    onSuccess: (data) => {
      toast.success(`Credits adjusted. New balance: ${data.newBalance}`);
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isValid = amount !== "" && !isNaN(Number(amount)) && Number(amount) !== 0;

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
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50 or -10"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. customer service adjustment"
            />
          </div>
        </div>
        <DialogFooter>
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

function BanModal({
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
    onSuccess: () => {
      toast.success(toBanned ? "User banned." : "User unbanned.");
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

// ─── Sessions Tab ─────────────────────────────────────────────────────────────
function SessionsTab() {
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-sessions", filterStatus],
    queryFn: () => listAdminSessions({ status: filterStatus || undefined, limit: 25 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="complete">Complete</option>
          <option value="incomplete">Incomplete</option>
          <option value="error">Error</option>
        </select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Conf.</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.sessions ?? []).map((s) => (
                <TableRow
                  key={s.id}
                  className="hover:bg-secondary/20 cursor-pointer"
                  onClick={() => setSelectedId(s.id)}
                >
                  <TableCell>
                    <p className="text-sm font-medium truncate max-w-[240px]">
                      {s.title ?? s.question?.slice(0, 60) ?? "Untitled"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{s.userId}</p>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {s.confidence ? `${s.confidence}%` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{s.creditsUsed ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                  <TableCell>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
              {!data?.sessions?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    No sessions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedId && (
        <SessionDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function SessionDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-session", id],
    queryFn: () => getAdminSession(id),
  });
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-card border-l border-border overflow-y-auto">
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
                <p>{data.session.confidence ? `${data.session.confidence}%` : "—"}</p>
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
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {data.turns.map((turn) => (
                      <div key={turn.id} className="rounded-lg border border-border bg-background p-3">
                        <p className="text-xs font-mono text-primary mb-1">
                          {turn.role} · Round {turn.round}
                        </p>
                        <p className="text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">
                          {(turn.content ?? "").slice(0, 500)}{(turn.content?.length ?? 0) > 500 ? "…" : ""}
                        </p>
                      </div>
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

// ─── Transactions Tab ─────────────────────────────────────────────────────────
function TransactionsTab() {
  const [filterType, setFilterType] = useState("");
  const [refundTarget, setRefundTarget] = useState<AdminTransaction | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-transactions", filterType],
    queryFn: () => listAdminTransactions({ type: filterType || undefined, limit: 30 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All types</option>
          <option value="purchase">Purchase</option>
          <option value="subscription_grant">Subscription grant</option>
          <option value="signup_bonus">Signup bonus</option>
          <option value="usage">Usage</option>
          <option value="refund">Refund</option>
          <option value="admin_adjustment">Admin adjustment</option>
        </select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance After</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.transactions ?? []).map((tx) => (
                <TableRow key={tx.id} className="hover:bg-secondary/20">
                  <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                    {tx.userId ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-mono uppercase">
                      {tx.type?.replace("_", " ") ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn("font-mono font-semibold", (tx.amount ?? 0) > 0 ? "text-primary" : "text-destructive")}>
                    {(tx.amount ?? 0) > 0 ? "+" : ""}{tx.amount}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{tx.balanceAfter ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{tx.source ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</TableCell>
                  <TableCell>
                    {tx.type === "usage" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
                        onClick={() => setRefundTarget(tx)}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Refund
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!data?.transactions?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    No transactions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {refundTarget && (
        <RefundModal
          tx={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-transactions"] })}
        />
      )}
    </div>
  );
}

function RefundModal({
  tx, onClose, onSuccess,
}: {
  tx: AdminTransaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(Math.abs(tx.amount ?? 0)));
  const [reason, setReason] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () => issueRefund(tx.userId!, Number(amount), reason || `refund_for_tx_${tx.id}`),
    onSuccess: (data) => {
      toast.success(`Refund issued. New balance: ${data.newBalance}`);
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
          <Button onClick={() => mutate()} disabled={!amount || isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Issue Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Feature Flags Tab ────────────────────────────────────────────────────────
const FLAG_DESCRIPTIONS: Record<string, string> = {
  guestMode: "Allow unverified/unauthenticated access to the app in demo mode",
  proUpgrade: "Show Pro upgrade prompts and Stripe checkout",
  exportPdf: "Enable PDF export of session reports",
  shareReports: "Allow users to generate public share links for sessions",
  templateLibrary: "Show the templates page and template selector in session",
  autoRefill: "Enable auto-refill credit top-up when balance falls below threshold",
};

function FeatureFlagsTab() {
  const qc = useQueryClient();

  const { data: flags, isLoading, refetch } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: getFeatureFlags,
  });

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: ({ name, value }: { name: string; value: boolean }) => setFeatureFlag(name, value),
    onSuccess: (_, { name, value }) => {
      toast.success(`${name}: ${value ? "enabled" : "disabled"}`);
      invalidateFeatureFlagCache();
      qc.invalidateQueries({ queryKey: ["admin-feature-flags"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Flags are stored in Firestore <code className="bg-secondary px-1 rounded text-xs">config/featureFlags</code> and cached client-side.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {Object.entries(flags ?? {}).map(([name, value]) => (
          <div key={name} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/10 transition-colors">
            <div className="space-y-0.5">
              <p className="font-medium text-sm font-mono">{name}</p>
              <p className="text-xs text-muted-foreground">{FLAG_DESCRIPTIONS[name] ?? ""}</p>
            </div>
            <Switch
              checked={value}
              onCheckedChange={(v) => toggle({ name, value: v })}
              disabled={isPending}
            />
          </div>
        ))}
        {!Object.keys(flags ?? {}).length && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No flags found. Feature flags will appear here after first initialization.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ["admin-templates"],
    queryFn: listAdminTemplates,
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAdminTemplate(id, { isActive }),
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? "Template activated" : "Template deactivated");
      qc.invalidateQueries({ queryKey: ["admin-templates"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Firestore templates supplement the app's built-in template list.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {templates?.length === 0 ? (
        <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
          No Firestore templates found. Built-in templates are defined in <code className="bg-secondary px-1 rounded text-xs">src/data/templates.ts</code>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {(templates ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/10">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{t.title ?? t.id}</p>
                <p className="text-xs text-muted-foreground truncate">{t.description ?? "—"}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.category}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(t)}>
                  <Edit3 className="w-3.5 h-3.5" />
                </Button>
                <Switch
                  checked={t.isActive !== false}
                  onCheckedChange={(v) => toggleActive({ id: t.id, isActive: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <TemplateEditModal
          template={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["admin-templates"] });
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

function TemplateEditModal({
  template, onClose, onSuccess,
}: {
  template: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(template.title ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [isActive, setIsActive] = useState(template.isActive !== false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => updateAdminTemplate(template.id, { title, description, isActive }),
    onSuccess: () => { toast.success("Template updated"); onSuccess(); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
          <DialogDescription>ID: <span className="font-mono text-xs">{template.id}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <label className="text-sm">Active (visible to users)</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutate()} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function TabSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-secondary/30 animate-pulse" />
      ))}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-border bg-card/40 py-6 px-3 gap-1">
        <div className="flex items-center gap-2 px-3 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">Admin</span>
        </div>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full",
              activeTab === id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </aside>

      {/* Mobile tab strip */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card flex overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-2 text-xs min-w-0 flex-1 transition-colors",
              activeTab === id ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 px-6 py-8 pb-24 lg:pb-8 max-w-5xl">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-xl font-bold">
            {TABS.find((t) => t.id === activeTab)?.label}
          </h1>
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "overview"     && <OverviewTab />}
          {activeTab === "users"        && <UsersTab />}
          {activeTab === "sessions"     && <SessionsTab />}
          {activeTab === "transactions" && <TransactionsTab />}
          {activeTab === "flags"        && <FeatureFlagsTab />}
          {activeTab === "templates"    && <TemplatesTab />}
        </motion.div>
      </div>
    </div>
  );
}
