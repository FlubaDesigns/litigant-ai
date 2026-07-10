import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users, Brain, CreditCard, Activity, Flag, LayoutTemplate,
  Search, ChevronRight, MoreHorizontal, Loader2, Shield,
  Ban, Zap, Clock, RefreshCw, Check, Edit3,
  AlertTriangle, TrendingUp, Database, Server, BarChart2,
  AlertCircle, HeartCrack, ThumbsDown, DollarSign, RotateCcw,
  ChevronDown, ChevronUp, SlidersHorizontal, Package, Plus, Trash2, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  getFeatureFlags, setFeatureFlag, getAdminLimits, setAdminLimit,
  getCreditPacks, createCreditPack, updateCreditPack, deactivateCreditPack,
  listAdminTemplates, updateAdminTemplate,
  getSystemHealth, getApiUsage, getErrorLogs, getAbuseFlags,
  getPricingConfig, updateModelMultiplier, resetModelMultiplier,
  getApiKeys, saveApiKey, deleteApiKey,
  getAdminBillingDefaults, saveAdminBillingDefaults,
  getChecklist, setChecklistItemChecked,
  type AdminUser, type AdminSession, type AdminTransaction, type SessionTurn,
  type PricingModel, type ProviderKeyInfo, type AdminCreditPack, type CreditPackBounds,
  type BillingDefaults, type ChecklistItem,
} from "@/services/adminService";
import { invalidateFeatureFlagCache } from "@/hooks/useFeatureFlag";

type AdminTab =
  | "overview" | "health" | "users" | "sessions" | "transactions" | "limits"
  | "api-usage" | "errors" | "abuse" | "flags" | "templates" | "pricing" | "credit-packs" | "api-keys"
  | "checklist";

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",       icon: Activity },
  { id: "checklist",    label: "Setup Checklist", icon: ListChecks },
  { id: "health",       label: "System Health",  icon: Server },
  { id: "pricing",      label: "Pricing",        icon: DollarSign },
  { id: "api-keys",     label: "API Keys",       icon: Shield },
  { id: "users",        label: "Users",           icon: Users },
  { id: "sessions",     label: "Sessions",        icon: Brain },
  { id: "transactions", label: "Transactions",    icon: CreditCard },
  { id: "api-usage",    label: "API Usage",       icon: BarChart2 },
  { id: "errors",       label: "Error Logs",      icon: AlertCircle },
  { id: "abuse",        label: "Abuse Flags",     icon: HeartCrack },
  { id: "credit-packs", label: "Credit Packs",    icon: Package },
  { id: "limits",       label: "Limits",          icon: SlidersHorizontal },
  { id: "flags",        label: "Feature Flags",   icon: Flag },
  { id: "templates",    label: "Templates",       icon: LayoutTemplate },
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
          Auto-refill via Square not yet wired into usage flow — manual refund available below
        </li>
      </ul>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ onOpenChecklist }: { onOpenChecklist: () => void }) {
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
        <ChecklistLinkCard onOpenChecklist={onOpenChecklist} />
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

      <ChecklistLinkCard onOpenChecklist={onOpenChecklist} />
      <SystemNotesCard />
    </div>
  );
}

// ─── Checklist Link Card (Overview access point) ──────────────────────────────
function ChecklistLinkCard({ onOpenChecklist }: { onOpenChecklist: () => void }) {
  const { data } = useQuery({
    queryKey: ["admin-checklist"],
    queryFn: getChecklist,
    retry: false,
  });

  const total = data?.length ?? 0;
  const done = data?.filter((i) => i.checked).length ?? 0;
  const ownerTotal = data?.filter((i) => i.section === "owner").length ?? 0;
  const ownerDone = data?.filter((i) => i.section === "owner" && i.checked).length ?? 0;

  return (
    <button
      onClick={onOpenChecklist}
      className="w-full text-left rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4 hover:bg-primary/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <ListChecks className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Setup Checklist</p>
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `${done}/${total} items done — ${ownerDone}/${ownerTotal} of your action items complete`
              : "Audit-derived to-do list for launch readiness"}
          </p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ─── Setup Checklist Tab ────────────────────────────────────────────────────────
function ChecklistSection({
  title, subtitle, items, onToggle,
}: {
  title: string;
  subtitle: string;
  items: ChecklistItem[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const done = items.filter((i) => i.checked).length;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">{done}/{items.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-start gap-3 p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
          >
            <Checkbox
              checked={item.checked}
              onCheckedChange={(v) => onToggle(item.id, v === true)}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <p className={cn("text-sm", item.checked ? "text-muted-foreground line-through" : "text-foreground")}>
                {item.text}
              </p>
              {item.note && (
                <p className="text-xs text-muted-foreground mt-1">{item.note}</p>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function ChecklistTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-checklist"],
    queryFn: getChecklist,
    retry: false,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) => setChecklistItemChecked(id, checked),
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: ["admin-checklist"] });
      const prev = qc.getQueryData<ChecklistItem[]>(["admin-checklist"]);
      qc.setQueryData<ChecklistItem[]>(["admin-checklist"], (old) =>
        old?.map((i) => (i.id === id ? { ...i, checked } : i)) ?? old
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin-checklist"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-checklist"] }),
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Firebase not configured — checklist state can't be saved in dev mode.
      </div>
    );
  }

  const agentItems = data.filter((i) => i.section === "agent");
  const ownerItems = data.filter((i) => i.section === "owner");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-2">
        <ListChecks className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-foreground">Launch readiness checklist. </span>
          Compiled from a full codebase audit. "Your action items" are things only you can do
          (secrets, third-party accounts, product decisions, legal content, deployment). "Agent
          work items" are code-level fixes tracked here so nothing falls through the cracks — check
          them off as they're completed.
        </div>
      </div>

      <ChecklistSection
        title="Your action items"
        subtitle="Manual setup, accounts, decisions, and content only you can complete"
        items={ownerItems}
        onToggle={(id, checked) => toggleMut.mutate({ id, checked })}
      />

      <ChecklistSection
        title="Agent work items"
        subtitle="Code-level fixes and audit follow-ups"
        items={agentItems}
        onToggle={(id, checked) => toggleMut.mutate({ id, checked })}
      />
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

  const {
    data: pages,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["admin-users", debouncedSearch],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listAdminUsers({ search: debouncedSearch || undefined, limit: 25, cursor: pageParam }),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    initialPageParam: undefined as string | undefined,
  });

  const users = pages?.pages.flatMap((p) => p.users) ?? [];

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
        <>
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
                {users.map((user) => (
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
                {!users.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="gap-2"
              >
                {isFetchingNextPage
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</>
                  : "Load more users"}
              </Button>
            </div>
          )}
          {!hasNextPage && users.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-1">
              Showing all {users.length} users
            </p>
          )}
        </>
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

// ─── Sessions Tab ─────────────────────────────────────────────────────────────
function SessionsTab() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterTemplateId, setFilterTemplateId] = useState("");
  const [debouncedUserId, setDebouncedUserId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserId(filterUserId), 400);
    return () => clearTimeout(t);
  }, [filterUserId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-sessions", filterStatus, debouncedUserId, filterTemplateId],
    queryFn: () => listAdminSessions({
      status: filterStatus || undefined,
      userId: debouncedUserId || undefined,
      templateId: filterTemplateId || undefined,
      limit: 25,
    }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <Input
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          placeholder="Filter by user ID…"
          className="h-9 w-52 text-sm font-mono"
        />
        <Input
          value={filterTemplateId}
          onChange={(e) => setFilterTemplateId(e.target.value)}
          placeholder="Filter by template ID…"
          className="h-9 w-48 text-sm font-mono"
        />
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

function TurnCard({ turn }: { turn: SessionTurn }) {
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

// ─── Transactions Tab ─────────────────────────────────────────────────────────
function TransactionsTab() {
  const [filterType, setFilterType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [debouncedUserId, setDebouncedUserId] = useState("");
  const [refundTarget, setRefundTarget] = useState<AdminTransaction | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserId(filterUserId), 400);
    return () => clearTimeout(t);
  }, [filterUserId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-transactions", filterType, debouncedUserId],
    queryFn: () => listAdminTransactions({
      type: filterType || undefined,
      userId: debouncedUserId || undefined,
      limit: 30,
    }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <Input
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          placeholder="Filter by user ID…"
          className="h-9 w-52 text-sm font-mono"
        />
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
  proUpgrade: "Show Pro upgrade prompts and Square checkout",
  exportPdf: "Enable PDF export of session reports",
  shareReports: "Allow users to generate public share links for sessions",
  templateLibrary: "Show the templates page and template selector in session",
  autoRefill: "Enable auto-refill credit top-up when balance falls below threshold",
};

const PLAN_SCOPE_LABELS: Record<string, string> = {
  all: "All plans",
  pro: "Pro only",
  free: "Free only",
};

// ─── Credit Packs Tab ────────────────────────────────────────────────────────
function CreditPacksTab() {
  const qc = useQueryClient();
  const [editingPack, setEditingPack] = useState<AdminCreditPack | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-credit-packs"],
    queryFn: getCreditPacks,
    retry: false,
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateCreditPack(id),
    onSuccess: (_data: any, id: string) => {
      toast.success(`${id} deactivated`);
      qc.invalidateQueries({ queryKey: ["admin-credit-packs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => updateCreditPack(id, { active: true }),
    onSuccess: (_data: any, id: string) => {
      toast.success(`${id} reactivated`);
      qc.invalidateQueries({ queryKey: ["admin-credit-packs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Firebase not configured — credit pack config unavailable in dev mode.
      </div>
    );
  }

  const activePacks = data.packs.filter((p) => p.active);
  const inactivePacks = data.packs.filter((p) => !p.active);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-2">
        <Package className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-foreground">How credit packs work: </span>
          These are the one-time top-up packs customers see on the Billing page. A pack's id is
          permanent once created — Square's checkout note embeds it, and renaming it would break the
          lookup for any in-flight or historical purchase. Deactivating hides a pack from checkout
          without losing its history; it can be reactivated any time.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Active packs</h3>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New pack
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/30">
              <TableHead className="text-xs">Pack</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs text-right">Price</TableHead>
              <TableHead className="text-xs text-right">Credits</TableHead>
              <TableHead className="text-xs text-right">Rate</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activePacks.map((pack) => {
              const price = pack.prices[0];
              const credits = parseInt(pack.metadata.creditAmount, 10) || 0;
              const dollars = (price?.unit_amount ?? 0) / 100;
              const rate = dollars > 0 ? credits / dollars : 0;
              return (
                <TableRow key={pack.id} className="group">
                  <TableCell className="font-medium text-sm">
                    {pack.name}
                    <div className="text-[10px] font-mono text-muted-foreground">{pack.id}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {pack.description}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${dollars.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-primary font-bold">
                    {credits.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {rate.toFixed(1)}/$
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setEditingPack(pack)}>
                        <Edit3 className="w-3 h-3" /> Edit
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={() => deactivateMut.mutate(pack.id)}
                        disabled={deactivateMut.isPending}
                      >
                        <Trash2 className="w-3 h-3" /> Deactivate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {activePacks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  No active packs. Create one to start selling credits.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {inactivePacks.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground">Deactivated</h3>
          <div className="rounded-xl border border-border overflow-hidden opacity-70">
            <Table>
              <TableBody>
                {inactivePacks.map((pack) => (
                  <TableRow key={pack.id}>
                    <TableCell className="font-medium text-sm">
                      {pack.name}
                      <div className="text-[10px] font-mono text-muted-foreground">{pack.id}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1"
                        onClick={() => reactivateMut.mutate(pack.id)}
                        disabled={reactivateMut.isPending}
                      >
                        <RotateCcw className="w-3 h-3" /> Reactivate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editingPack && (
        <CreditPackDialog
          mode="edit"
          pack={editingPack}
          bounds={data.bounds}
          onClose={() => setEditingPack(null)}
        />
      )}
      {creating && (
        <CreditPackDialog
          mode="create"
          bounds={data.bounds}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CreditPackDialog({
  mode,
  pack,
  bounds,
  onClose,
}: {
  mode: "create" | "edit";
  pack?: AdminCreditPack;
  bounds: CreditPackBounds;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [id, setId] = useState(pack?.id ?? "");
  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [dollars, setDollars] = useState(pack ? String((pack.prices[0]?.unit_amount ?? 0) / 100) : "");
  const [credits, setCredits] = useState(pack ? pack.metadata.creditAmount : "");

  const minDollars = bounds.MIN_UNIT_AMOUNT_CENTS / 100;
  const maxDollars = bounds.MAX_UNIT_AMOUNT_CENTS / 100;

  const saveMut = useMutation({
    mutationFn: async () => {
      const unitAmountCents = Math.round(Number(dollars) * 100);
      const creditAmount = Number(credits);
      if (mode === "create") {
        await createCreditPack({ id, name, description, unitAmountCents, creditAmount });
      } else {
        await updateCreditPack(pack!.id, { name, description, unitAmountCents, creditAmount });
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Pack created" : "Pack updated");
      qc.invalidateQueries({ queryKey: ["admin-credit-packs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dollarsNum = Number(dollars);
  const creditsNum = Number(credits);
  const idValid = mode === "edit" || /^[a-z0-9_]+$/.test(id);
  const dollarsValid = dollars !== "" && dollarsNum >= minDollars && dollarsNum <= maxDollars;
  const creditsValid =
    credits !== "" && Number.isInteger(creditsNum) && creditsNum >= bounds.MIN_CREDIT_AMOUNT && creditsNum <= bounds.MAX_CREDIT_AMOUNT;
  const canSave = idValid && !!name.trim() && dollarsValid && creditsValid && !saveMut.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New credit pack" : `Edit ${pack?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "The id below is permanent once created."
              : "Price, credits, name, and description can be changed any time. The pack id itself cannot be changed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "create" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pack ID</label>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase())}
                placeholder="e.g. value_pack"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, underscores only. Cannot be changed later.</p>
            </div>
          )}
          {mode === "edit" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pack ID</label>
              <Input value={pack?.id ?? ""} disabled className="font-mono text-sm opacity-60" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Value Pack" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to customers on the Billing page"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Price (USD, ${minDollars.toFixed(2)}–${maxDollars.toFixed(2)})
              </label>
              <Input
                type="number" step="0.01" min={minDollars} max={maxDollars}
                value={dollars} onChange={(e) => setDollars(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Credits ({bounds.MIN_CREDIT_AMOUNT}–{bounds.MAX_CREDIT_AMOUNT.toLocaleString()})
              </label>
              <Input
                type="number" step="1" min={bounds.MIN_CREDIT_AMOUNT} max={bounds.MAX_CREDIT_AMOUNT}
                value={credits} onChange={(e) => setCredits(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {dollarsValid && creditsValid && (
            <p className="text-xs text-muted-foreground">
              Rate: <span className="font-mono text-primary">{(creditsNum / dollarsNum).toFixed(1)} credits/$</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "create" ? "Create pack" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Limits Tab ───────────────────────────────────────────────────────────────

const LIMIT_DESCRIPTIONS: Record<string, { label: string; description: string; min: number; max: number }> = {
  maxLitigants: {
    label: "Max Litigants",
    description: "Maximum number of AI debaters a user can select per session. Default: 10. Range: 2–20.",
    min: 2,
    max: 20,
  },
};

function LimitsTab() {
  const qc = useQueryClient();

  const { data: limits, isLoading, refetch } = useQuery({
    queryKey: ["admin-limits"],
    queryFn: getAdminLimits,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: ({ name, value }: { name: string; value: number }) => setAdminLimit(name, value),
    onSuccess: (_, { name, value }) => {
      toast.success(`${name} set to ${value}`);
      qc.invalidateQueries({ queryKey: ["admin-limits"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Numeric platform limits stored in Firestore{" "}
            <code className="bg-secondary px-1 rounded text-xs">config/adminLimits</code>.
            Changes take effect immediately for new sessions.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {Object.entries(LIMIT_DESCRIPTIONS).map(([name, meta]) => {
            const current = (limits as Record<string, number>)?.[name] ?? meta.min;
            return (
              <div key={name} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/10 transition-colors gap-6">
                <div className="flex-1 space-y-0.5 min-w-0">
                  <p className="font-medium text-sm font-mono">{name}</p>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => save({ name, value: Math.max(meta.min, current - 1) })}
                    disabled={isPending || current <= meta.min}
                    className="w-7 h-7 rounded border border-border flex items-center justify-center text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 transition-colors"
                  >−</button>
                  <span className="w-8 text-center font-mono font-semibold text-sm tabular-nums">{current}</span>
                  <button
                    onClick={() => save({ name, value: Math.min(meta.max, current + 1) })}
                    disabled={isPending || current >= meta.max}
                    className="w-7 h-7 rounded border border-border flex items-center justify-center text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 transition-colors"
                  >+</button>
                  <span className="text-xs text-muted-foreground w-14 text-right">{meta.min}–{meta.max}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BillingDefaultsSection />
    </div>
  );
}

function BillingDefaultsSection() {
  const qc = useQueryClient();
  const [amountsInput, setAmountsInput] = useState("");
  const [edited, setEdited] = useState<Partial<BillingDefaults>>({});

  const { data: defaults, isLoading } = useQuery({
    queryKey: ["admin-billing-defaults"],
    queryFn: getAdminBillingDefaults,
    onSuccess: (d: BillingDefaults) => {
      setAmountsInput(d.autoRefillAmounts.join(", "));
    },
  } as any);

  const { mutate: saveDefs, isPending } = useMutation({
    mutationFn: (updates: Partial<BillingDefaults>) => saveAdminBillingDefaults(updates),
    onSuccess: () => {
      toast.success("Billing defaults saved.");
      setEdited({});
      qc.invalidateQueries({ queryKey: ["admin-billing-defaults"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const BILLING_FALLBACK: BillingDefaults = {
    autoRefillAmounts: [10, 20, 50, 100, 200],
    defaultAutoRefillAmount: 20,
    defaultThresholdCredits: 100,
    defaultWarningThresholdCredits: 200,
  };
  const current: BillingDefaults = {
    ...(defaults ?? BILLING_FALLBACK),
    ...Object.fromEntries(Object.entries(edited).filter(([, v]) => v !== undefined)),
  } as BillingDefaults;

  function handleSave() {
    const parsedAmounts = amountsInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    saveDefs({ ...edited, autoRefillAmounts: parsedAmounts });
  }

  if (isLoading) return <div className="h-32 rounded-xl border border-border/40 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Billing Defaults</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Default values pre-populated for users on the Billing page. Stored in{" "}
          <code className="bg-secondary px-1 rounded text-xs">config/billingDefaults</code>.
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {/* Auto-refill amounts */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm font-medium">Auto Top-Up Amounts</p>
          <p className="text-xs text-muted-foreground">Comma-separated dollar amounts shown as quick-pick options.</p>
          <input
            type="text"
            value={amountsInput}
            onChange={(e) => setAmountsInput(e.target.value)}
            placeholder="10, 20, 50, 100, 200"
            className="w-full h-8 rounded-lg border border-border/60 bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Default amount */}
        <div className="flex items-center justify-between px-5 py-4 gap-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Default Charge Amount</p>
            <p className="text-xs text-muted-foreground">Pre-selected dollar amount for new users.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number"
              min={1}
              max={500}
              value={current.defaultAutoRefillAmount}
              onChange={(e) => setEdited((prev) => ({ ...prev, defaultAutoRefillAmount: parseInt(e.target.value) || 20 }))}
              className="w-20 h-8 rounded-lg border border-border/60 bg-background px-3 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Default trigger threshold */}
        <div className="flex items-center justify-between px-5 py-4 gap-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Default Top-Up Trigger</p>
            <p className="text-xs text-muted-foreground">Charge fires when balance drops below this many credits.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={10000}
              value={current.defaultThresholdCredits}
              onChange={(e) => setEdited((prev) => ({ ...prev, defaultThresholdCredits: parseInt(e.target.value) || 100 }))}
              className="w-24 h-8 rounded-lg border border-border/60 bg-background px-3 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">credits</span>
          </div>
        </div>

        {/* Default warning threshold */}
        <div className="flex items-center justify-between px-5 py-4 gap-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Default Warning Threshold</p>
            <p className="text-xs text-muted-foreground">Show low-balance banner when credits drop below this.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100000}
              value={current.defaultWarningThresholdCredits}
              onChange={(e) => setEdited((prev) => ({ ...prev, defaultWarningThresholdCredits: parseInt(e.target.value) || 200 }))}
              className="w-24 h-8 rounded-lg border border-border/60 bg-background px-3 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">credits</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Save Billing Defaults
        </Button>
      </div>
    </div>
  );
}

function FeatureFlagsTab() {
  const qc = useQueryClient();

  const { data: flags, isLoading, refetch } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: getFeatureFlags,
  });

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: ({ name, value }: { name: string; value: boolean | string }) => setFeatureFlag(name, value),
    onSuccess: (_, { name, value }) => {
      if (name.endsWith("_scope")) {
        toast.success(`Scope updated: ${PLAN_SCOPE_LABELS[value as string] ?? value}`);
      } else {
        toast.success(`${name}: ${value ? "enabled" : "disabled"}`);
        invalidateFeatureFlagCache();
      }
      qc.invalidateQueries({ queryKey: ["admin-feature-flags"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <TabSkeleton />;

  const flagEntries = Object.entries(flags ?? {}).filter(([k]) => !k.endsWith("_scope"));

  function getScope(name: string): string {
    return (flags as Record<string, any>)?.[`${name}_scope`] ?? "all";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Flags stored in Firestore <code className="bg-secondary px-1 rounded text-xs">config/featureFlags</code>.
          Each flag can be scoped to all users or a specific plan tier.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {flagEntries.map(([name, value]) => (
          <div key={name} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/10 transition-colors gap-4">
            <div className="flex-1 space-y-0.5 min-w-0">
              <p className="font-medium text-sm font-mono">{name}</p>
              <p className="text-xs text-muted-foreground">{FLAG_DESCRIPTIONS[name] ?? ""}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <select
                value={getScope(name)}
                onChange={(e) => toggle({ name: `${name}_scope`, value: e.target.value })}
                disabled={isPending || !value}
                title="Plan scope"
                className="h-7 rounded border border-input bg-background px-2 text-xs text-muted-foreground disabled:opacity-40"
              >
                <option value="all">All plans</option>
                <option value="pro">Pro only</option>
                <option value="free">Free only</option>
              </select>
              <Switch
                checked={value as boolean}
                onCheckedChange={(v) => toggle({ name, value: v })}
                disabled={isPending}
              />
            </div>
          </div>
        ))}
        {!flagEntries.length && (
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
  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt ?? "");
  const [isActive, setIsActive] = useState(template.isActive !== false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => updateAdminTemplate(template.id, { title, description, systemPrompt: systemPrompt || undefined, isActive }),
    onSuccess: () => { toast.success("Template updated"); onSuccess(); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">System Prompt Override</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Leave blank to use the built-in default for this template…"
              className="font-mono text-xs min-h-[120px] resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Overrides the default system prompt sent to AI litigants for this template.
            </p>
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

// ─── System Health Tab ────────────────────────────────────────────────────────
function SystemHealthTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: getSystemHealth,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data || data.status === "unavailable") {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Firebase not configured — system health data is unavailable in dev mode.</span>
      </div>
    );
  }

  const { collections, last24h, last7d, serverTime } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-mono">
          Server time: {serverTime ? new Date(serverTime).toLocaleString() : "—"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {/* Collection counts */}
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5" />Collection sizes
        </p>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(collections ?? {}).map(([col, count]) => (
            <div key={col} className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold font-mono">{count as number}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{col}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Last 24h */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />Last 24 hours
        </p>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-2xl font-bold font-mono text-primary">{(last24h as any)?.newSessions ?? 0}</p>
            <p className="text-xs text-muted-foreground">new sessions</p>
          </div>
        </div>
      </div>

      {/* Last 7d */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />Last 7 days
        </p>
        <div className="flex items-center gap-8 text-sm">
          <div>
            <p className="text-2xl font-bold font-mono text-destructive">{(last7d as any)?.errorSessions ?? 0}</p>
            <p className="text-xs text-muted-foreground">error sessions</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{(last7d as any)?.feedbackEntries ?? 0}</p>
            <p className="text-xs text-muted-foreground">feedback entries</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-amber-400">{(last7d as any)?.errorRate ?? "0.0"}%</p>
            <p className="text-xs text-muted-foreground">session error rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── API Usage Tab ────────────────────────────────────────────────────────────
function ApiUsageTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-api-usage"],
    queryFn: getApiUsage,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Firebase not configured — API usage data unavailable in dev mode.</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-2xl font-bold font-mono text-primary">{data.totalCreditsUsed}</p>
            <p className="text-xs text-muted-foreground">credits used (30d)</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{data.totalSessions}</p>
            <p className="text-xs text-muted-foreground">usage transactions (30d)</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {data.byDay.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead>Date</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Credits Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byDay.map((day) => (
                <TableRow key={day.date} className="hover:bg-secondary/10">
                  <TableCell className="font-mono text-sm">{day.date}</TableCell>
                  <TableCell className="font-mono">{day.sessions}</TableCell>
                  <TableCell className="font-mono text-primary">{day.creditsUsed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
          No usage data for the last 30 days.
          <p className="mt-1 text-xs">Usage data populates from <code className="bg-secondary px-1 rounded">credit_transactions</code> where type=&#39;usage&#39;.</p>
        </div>
      )}

      {data.apiLogs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">api_logs (last 200)</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.apiLogs.slice(0, 30).map((log: any) => (
                  <TableRow key={log.id} className="hover:bg-secondary/10">
                    <TableCell className="font-mono text-xs">{log.model ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", log.status === "error" ? "text-destructive" : "text-primary border-primary/30")}>
                        {log.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.durationMs ? `${log.durationMs}ms` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(log.createdAt as string)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Error Logs Tab ───────────────────────────────────────────────────────────
function ErrorLogsTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-error-logs"],
    queryFn: getErrorLogs,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Firebase not configured — error logs unavailable in dev mode.</span>
      </div>
    );
  }

  const allEntries = [
    ...data.logs.map((l) => ({ ...l, source: "api_log" })),
    ...data.failedSessions.map((s) => ({ ...s, source: "session" })),
  ].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Shows failed sessions + <code className="bg-secondary px-1 rounded text-xs">api_logs</code> error entries.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {allEntries.length === 0 ? (
        <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
          No error logs found.
          <p className="mt-1 text-xs">Failed brain sessions will appear here automatically.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead>Source</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allEntries.slice(0, 50).map((entry: any) => (
                <TableRow key={entry.id} className="hover:bg-secondary/10">
                  <TableCell>
                    <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                      {entry.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate">
                    {entry.message ?? entry.title ?? entry.question?.slice(0, 60) ?? entry.id}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                    {entry.userId ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Abuse Flags Tab ──────────────────────────────────────────────────────────
function AbuseFlagsTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-abuse-flags"],
    queryFn: getAbuseFlags,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Firebase not configured — abuse flag data unavailable in dev mode.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Sessions flagged as <code className="bg-secondary px-1 rounded text-xs">bad</code> or{" "}
          <code className="bg-secondary px-1 rounded text-xs">warn</code> by user feedback.
          Total: <span className="font-mono text-foreground">{data.totalCount}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {data.flags.length === 0 ? (
        <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
          No abuse flags found.
          <p className="mt-1 text-xs">Negative feedback from sessions appears here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead>Rating</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.flags.map((flag) => (
                <TableRow key={flag.id} className="hover:bg-secondary/10">
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs gap-1",
                        flag.rating === "bad"
                          ? "text-destructive border-destructive/30 bg-destructive/10"
                          : "text-amber-400 border-amber-400/30 bg-amber-400/10"
                      )}
                    >
                      <ThumbsDown className="w-3 h-3" />
                      {flag.rating}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{flag.role ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                    {flag.reason ?? flag.notes ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]">
                    {flag.sessionId ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]">
                    {flag.userId ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(flag.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── API Keys Tab ────────────────────────────────────────────────────────────
const KNOWN_PROVIDERS: { id: string; label: string; envVar: string; baseUrl?: string; placeholder: string }[] = [
  { id: "openai",    label: "OpenAI",           envVar: "OPENAI_API_KEY",    placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic (Claude)",envVar: "ANTHROPIC_API_KEY", placeholder: "sk-ant-..." },
  { id: "grok",      label: "xAI Grok",         envVar: "XAI_API_KEY",       placeholder: "xai-...", baseUrl: "https://api.x.ai/v1" },
  { id: "gemini",    label: "Google Gemini",    envVar: "GEMINI_API_KEY",    placeholder: "AIza...", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
];

function ProviderRow({
  info,
  onEdit,
  onDelete,
}: {
  info: ProviderKeyInfo;
  onEdit: (info: ProviderKeyInfo) => void;
  onDelete: (info: ProviderKeyInfo) => void;
}) {
  return (
    <TableRow className="group">
      <TableCell className="font-medium text-sm">
        {info.label}
        {info.source === "env" && (
          <Badge className="ml-2 text-[10px] bg-secondary text-muted-foreground border-border">env var</Badge>
        )}
        {info.source === "firestore" && (
          <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/20">Firestore</Badge>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{info.maskedKey}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">
        {info.baseUrl ?? "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {info.updatedAt ? new Date(info.updatedAt).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(info)}>
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
          {info.source === "firestore" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => onDelete(info)}>
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface KeyFormState {
  providerId: string;
  label: string;
  key: string;
  baseUrl: string;
  isCustom: boolean;
}

function ApiKeysTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProviderKeyInfo | null>(null);
  const [form, setForm] = useState<KeyFormState>({
    providerId: "", label: "", key: "", baseUrl: "", isCustom: false,
  });

  const { data: keys = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: getApiKeys,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: () => saveApiKey(form.providerId, form.key, form.label, form.baseUrl || undefined),
    onSuccess: () => {
      toast.success(`${form.label} API key saved`);
      setShowForm(false);
      setEditTarget(null);
      setForm({ providerId: "", label: "", key: "", baseUrl: "", isCustom: false });
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: (_d, id) => {
      toast.success(`${id} key removed from Firestore (env var fallback still active if set)`);
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openAdd(presetId?: string) {
    const known = KNOWN_PROVIDERS.find((p) => p.id === presetId);
    setEditTarget(null);
    setForm({
      providerId: presetId ?? "",
      label: known?.label ?? "",
      key: "",
      baseUrl: known?.baseUrl ?? "",
      isCustom: !presetId,
    });
    setShowForm(true);
  }

  function openEdit(info: ProviderKeyInfo) {
    setEditTarget(info);
    setForm({
      providerId: info.id,
      label: info.label,
      key: "",
      baseUrl: info.baseUrl ?? "",
      isCustom: !KNOWN_PROVIDERS.find((p) => p.id === info.id),
    });
    setShowForm(true);
  }

  const configuredIds = new Set(keys.map((k) => k.id));
  const unconfiguredKnown = KNOWN_PROVIDERS.filter((p) => !configuredIds.has(p.id));

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Firebase not configured — API key management unavailable in dev mode. Keys can still be set via environment variables.
        </div>
      )}

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-2">
        <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-foreground">Keys are stored server-side only.</span>{" "}
          The full key is never sent to the browser — you only see a masked version here.
          Firestore keys override env vars. Deleting a Firestore key re-activates its env var fallback.
          Custom providers use the OpenAI-compatible API format.
        </div>
      </div>

      {/* Configured providers */}
      {keys.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Configured Providers</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Masked Key</TableHead>
                  <TableHead className="text-xs">Base URL</TableHead>
                  <TableHead className="text-xs">Updated</TableHead>
                  <TableHead className="text-xs w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <ProviderRow key={k.id} info={k} onEdit={openEdit} onDelete={(i) => deleteMut.mutate(i.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Quick-add known providers not yet configured */}
      {unconfiguredKnown.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Add Known Provider</h3>
          <div className="flex flex-wrap gap-2">
            {unconfiguredKnown.map((p) => (
              <Button key={p.id} variant="outline" size="sm" className="gap-2" onClick={() => openAdd(p.id)}>
                <Zap className="w-3.5 h-3.5 text-primary" />
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Add custom / new provider */}
      <div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => openAdd()}>
          <DollarSign className="w-3.5 h-3.5 text-primary" />
          Add Custom Provider
        </Button>
        <p className="text-xs text-muted-foreground mt-1.5">
          Any OpenAI-compatible API — add future providers here without redeploying.
        </p>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">
            {editTarget ? `Update key for ${editTarget.label}` : "Add Provider"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Provider ID — locked if known */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Provider ID</label>
              <Input
                value={form.providerId}
                onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") }))}
                placeholder="e.g. my-gpt, mistral, together-ai"
                disabled={!!editTarget}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Lowercase letters, numbers, hyphens. Cannot change after creation.</p>
            </div>

            {/* Display label */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Display Label</label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Mistral Large"
              />
            </div>

            {/* API Key */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                API Key {editTarget && <span className="text-[10px]">(leave blank to keep existing)</span>}
              </label>
              <Input
                type="password"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder={
                  editTarget
                    ? `Current: ${editTarget.maskedKey} — paste new key to replace`
                    : KNOWN_PROVIDERS.find((p) => p.id === form.providerId)?.placeholder ?? "Paste your API key"
                }
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>

            {/* Base URL — always shown for custom, optional for known */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Base URL <span className="text-[10px] font-normal">(OpenAI-compatible endpoint — required for custom providers)</span>
              </label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (editTarget && !form.key.trim()) {
                  toast.error("Paste a new key to update, or cancel");
                  return;
                }
                saveMut.mutate();
              }}
              disabled={saveMut.isPending || !form.providerId || !form.label}
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              {editTarget ? "Update Key" : "Save Key"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditTarget(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pricing Tab ─────────────────────────────────────────────────────────────
const PROVIDER_ORDER = ["openai", "anthropic", "grok", "gemini"];
const PROVIDER_LABELS: Record<string, string> = {
  openai: "🤖 OpenAI", anthropic: "🔮 Anthropic", grok: "⚡ xAI Grok", gemini: "✨ Google Gemini",
};

function MultiplierCell({ row, onSaved }: { row: PricingModel; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.effectiveMultiplier));
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: () => updateModelMultiplier(row.model, Number(draft)),
    onSuccess: () => {
      toast.success(`${row.label} → ${draft}× saved`);
      setEditing(false);
      onSaved();
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => resetModelMultiplier(row.model),
    onSuccess: () => {
      toast.success(`${row.label} reset to default (${row.defaultMultiplier}×)`);
      onSaved();
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number" min={1} max={100} step={0.5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-20 text-xs font-mono"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") saveMut.mutate();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>✕</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-sm font-mono font-bold", row.isOverridden ? "text-primary" : "text-foreground")}>
        {row.effectiveMultiplier}×
      </span>
      {row.isOverridden && (
        <span className="text-xs text-muted-foreground">(default: {row.defaultMultiplier}×)</span>
      )}
      <button onClick={() => { setDraft(String(row.effectiveMultiplier)); setEditing(true); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-muted-foreground hover:text-foreground">
        <Edit3 className="w-3.5 h-3.5" />
      </button>
      {row.isOverridden && (
        <button onClick={() => resetMut.mutate()} disabled={resetMut.isPending}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-amber-400">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function PricingTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: getPricingConfig,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Firebase not configured — pricing config unavailable in dev mode.
      </div>
    );
  }

  const byProvider = PROVIDER_ORDER.map((p) => ({
    provider: p,
    models: data.models.filter((m) => m.provider === p),
  })).filter((g) => g.models.length > 0);

  const totalModels = data.models.length;
  const overriddenCount = data.models.filter((m) => m.isOverridden).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Credit Value</p>
          <p className="text-2xl font-bold font-mono text-primary">${data.creditValueUsd.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">per credit (fixed)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Models</p>
          <p className="text-2xl font-bold font-mono">{totalModels}</p>
          <p className="text-xs text-muted-foreground">across 4 providers</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Overrides Active</p>
          <p className={cn("text-2xl font-bold font-mono", overriddenCount > 0 ? "text-primary" : "text-foreground")}>
            {overriddenCount}
          </p>
          <p className="text-xs text-muted-foreground">custom multipliers</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-2">
        <DollarSign className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-foreground">How pricing works: </span>
          Credit cost = (input tokens × input rate + output tokens × output rate) × <strong>your multiplier</strong> ÷ $0.01.
          Edit any multiplier inline — changes take effect within 60 seconds (cache TTL).
          The <em>Example</em> column shows credits for a default session (3 litigants, 2 rounds, balanced).
        </div>
      </div>

      {byProvider.map(({ provider, models }) => (
        <div key={provider} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{PROVIDER_LABELS[provider] ?? provider}</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-xs text-right">Input /1K</TableHead>
                  <TableHead className="text-xs text-right">Output /1K</TableHead>
                  <TableHead className="text-xs">Your Multiplier</TableHead>
                  <TableHead className="text-xs text-right">Example Credits</TableHead>
                  <TableHead className="text-xs text-right">Example Cost to User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.model} className="group">
                    <TableCell className="font-medium text-sm">
                      {m.label}
                      {m.isOverridden && (
                        <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/20">custom</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      ${(m.inputRatePer1k * 1000).toFixed(4)}/M
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      ${(m.outputRatePer1k * 1000).toFixed(4)}/M
                    </TableCell>
                    <TableCell>
                      <MultiplierCell row={m} onSaved={() => refetch()} />
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">
                      {m.exampleCredits}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${(m.exampleCredits * data.creditValueUsd).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
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
          {activeTab === "overview"     && <OverviewTab onOpenChecklist={() => setActiveTab("checklist")} />}
          {activeTab === "checklist"    && <ChecklistTab />}
          {activeTab === "health"       && <SystemHealthTab />}
          {activeTab === "pricing"      && <PricingTab />}
          {activeTab === "api-keys"     && <ApiKeysTab />}
          {activeTab === "users"        && <UsersTab />}
          {activeTab === "sessions"     && <SessionsTab />}
          {activeTab === "transactions" && <TransactionsTab />}
          {activeTab === "api-usage"    && <ApiUsageTab />}
          {activeTab === "errors"       && <ErrorLogsTab />}
          {activeTab === "abuse"        && <AbuseFlagsTab />}
          {activeTab === "credit-packs" && <CreditPacksTab />}
          {activeTab === "limits"       && <LimitsTab />}
          {activeTab === "flags"        && <FeatureFlagsTab />}
          {activeTab === "templates"    && <TemplatesTab />}
        </motion.div>
      </div>
    </div>
  );
}
