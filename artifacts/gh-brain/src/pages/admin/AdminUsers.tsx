import { accountAccess } from "@workspace/api-zod/session";
import { useState, useEffect } from "react";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Search, ChevronRight, MoreHorizontal, Loader2, Ban, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { listAdminUsers, type AdminUser } from "@/services/adminService";
import { formatDate, LoadError, TabSkeleton } from "./AdminShared";
import { UserProfileSheet, CreditAdjustModal, BanModal } from "./AdminUserDetails";

export function UsersTab() {
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
    isError,
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
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
            aria-label="Search users by name or email"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh users" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isError && <LoadError onRetry={refetch} />}
      {isLoading ? (
        <TabSkeleton />
      ) : (
        <>
          <div className="row layout__split-2">
            {users.map(user => (
              <article key={user.id} className="lgt-card lgt-card--compact space-y-3" aria-label={`User ${user.displayName ?? user.email ?? user.id}`}>
                <div className="flex items-start gap-2">
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setSelectedUid(user.id)} aria-label={`View profile for ${user.displayName ?? user.email ?? user.id}`}>
                    <span className="block font-medium text-sm">{user.displayName ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground break-words">{user.email ?? user.id}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Actions for ${user.displayName ?? user.email ?? user.id}`}>
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
                </div>
                <dl className="space-y-3">
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Plan</dt>
                      <dd><Badge variant="outline" className="text-xs font-mono uppercase">{accountAccess(user.plan).label}</Badge></dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Credits</dt>
                      <dd className="font-mono text-sm">{user.creditBalance ?? 0}</dd>
                    </div>
                  </div>
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Status</dt>
                      <dd>{user.banned ? (
                        <Badge variant="destructive" className="text-xs">Banned</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-primary border-primary/30 bg-primary/10">Active</Badge>
                      )}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Joined</dt>
                      <dd className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</dd>
                    </div>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          {!isError && !users.length && <p className="py-6 text-center text-muted-foreground text-sm">No users found</p>}

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
          {!isError && !hasNextPage && users.length > 0 && (
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
