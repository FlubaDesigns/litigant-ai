import { useState, useEffect, useCallback } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, Search, Star, Archive, Trash2, Share2, Download,
  Edit3, Check, X, ChevronRight, Clock, Zap, Target,
  MoreHorizontal, Filter, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSessions, getSession, updateSession, deleteSession,
  generateShareLink, exportSessionAsMarkdown, type SavedSession,
} from "@/services/sessionService";
import { TEMPLATES } from "@/data/templates";

type TabView = "all" | "starred" | "archived";

const STATUS_STYLES: Record<string, string> = {
  complete: "text-primary border-primary/30 bg-primary/10",
  incomplete: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  error: "text-red-400 border-red-400/30 bg-red-400/10",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function getTemplateName(templateId: string | null): string {
  if (!templateId) return "Custom";
  return TEMPLATES.find((t) => t.id === templateId)?.title ?? templateId;
}

function SessionDetail({ session, onClose }: { session: SavedSession; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-card border-l border-border overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base leading-tight pr-6">{session.title}</SheetTitle>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[session.status] ?? "")}>
              {session.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDate(session.createdAt)}</span>
            {session.confidence > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Target className="w-3 h-3" />{session.confidence}%
              </span>
            )}
            {session.creditsUsed > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3" />{session.creditsUsed} credits
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Question</p>
            <p className="text-foreground/90 leading-relaxed">{session.question}</p>
          </div>

          {session.finalAnswer && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Final Answer</p>
              <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap text-xs">{session.finalAnswer}</p>
            </div>
          )}

          {session.artifacts && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Artifacts</p>
              <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans bg-muted/20 rounded-lg p-3 overflow-x-auto">{session.artifacts}</pre>
            </div>
          )}

          {session.debateNotes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Debate Notes</p>
              <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans bg-muted/20 rounded-lg p-3 max-h-48 overflow-y-auto">{session.debateNotes}</pre>
            </div>
          )}

          {session.transcript && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Full Transcript</p>
              <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans bg-muted/20 rounded-lg p-3 max-h-64 overflow-y-auto">{session.transcript}</pre>
            </div>
          )}

          {session.caveats && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Sources & Caveats</p>
              <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans bg-muted/20 rounded-lg p-3">{session.caveats}</pre>
            </div>
          )}

          {!session.finalAnswer && !session.debateNotes && !session.transcript && (
            <p className="text-muted-foreground text-xs text-center py-8">
              Session content is not available in the list view. This session may have been saved without full transcript data.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface SessionRowProps {
  session: SavedSession;
  onOpen: () => void;
  onRename: (title: string) => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onExport: () => void;
  onShare: () => void;
}

function SessionRow({
  session, onOpen, onRename, onToggleStar, onToggleArchive, onDelete, onExport, onShare,
}: SessionRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title);

  function submitRename() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card/50 hover:border-border/80 hover:bg-card transition-all"
    >
      {/* Star */}
      <button
        onClick={onToggleStar}
        className={cn(
          "shrink-0 p-1 rounded transition-colors",
          session.starred ? "text-amber-400" : "text-muted-foreground/30 hover:text-amber-400"
        )}
      >
        <Star className="w-4 h-4" fill={session.starred ? "currentColor" : "none"} />
      </button>

      {/* Main content */}
      <button className="flex-1 min-w-0 text-left" onClick={editing ? undefined : onOpen}>
        {editing ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-7 text-sm bg-background border-primary/40 focus-visible:ring-primary/30"
              autoFocus
            />
            <button onClick={submitRename} className="text-primary hover:text-primary/80">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium truncate">{session.title}</span>
              {session.archived && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50 h-4 px-1">
                  archived
                </Badge>
              )}
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0 ml-auto group-hover:text-muted-foreground transition-colors" />
            </div>
            <p className="text-xs text-muted-foreground truncate">{session.question}</p>
          </>
        )}
      </button>

      {/* Meta */}
      <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
        <span>{getTemplateName(session.templateId)}</span>
        {session.confidence > 0 && (
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3" />{session.confidence}%
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />{formatDate(session.updatedAt ?? session.createdAt)}
        </span>
        <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", STATUS_STYLES[session.status] ?? "")}>
          {session.status}
        </Badge>
      </div>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Edit3 className="w-3.5 h-3.5 mr-2" />Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleStar}>
            <Star className="w-3.5 h-3.5 mr-2" />
            {session.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleArchive}>
            <Archive className="w-3.5 h-3.5 mr-2" />
            {session.archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onShare}>
            <Share2 className="w-3.5 h-3.5 mr-2" />Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExport}>
            <Download className="w-3.5 h-3.5 mr-2" />Export MD
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const { user, firebaseReady } = useAuth();
  const [, setLocation] = useLocation();

  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tabView, setTabView] = useState<TabView>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [detailSession, setDetailSession] = useState<SavedSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadSessions = useCallback(async (cursor: string | null = null, append = false, tab: TabView = tabView) => {
    if (!user) return;
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const page = await getSessions(idToken, {
        limit: PAGE_SIZE,
        cursor,
        starred: tab === "starred",
        archived: tab === "archived",
      });
      setSessions((prev) => append ? [...prev, ...page.sessions] : page.sessions);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch {
      toast.error("Failed to load sessions.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, tabView]);

  useEffect(() => {
    loadSessions(null, false, tabView);
  }, [user, tabView]);

  async function openDetail(session: SavedSession) {
    if (!user) return;
    if (session.finalAnswer || session.transcript) {
      setDetailSession(session);
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const full = await getSession(session.id, idToken);
      setDetailSession(full);
    } catch {
      setDetailSession(session);
    }
  }

  async function handleRename(id: string, title: string) {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await updateSession(id, { title }, idToken);
      setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
      toast.success("Session renamed.");
    } catch {
      toast.error("Failed to rename session.");
    }
  }

  async function handleToggleStar(session: SavedSession) {
    if (!user) return;
    const starred = !session.starred;
    try {
      const idToken = await user.getIdToken();
      await updateSession(session.id, { starred }, idToken);
      setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, starred } : s));
    } catch {
      toast.error("Failed to update session.");
    }
  }

  async function handleToggleArchive(session: SavedSession) {
    if (!user) return;
    const archived = !session.archived;
    try {
      const idToken = await user.getIdToken();
      await updateSession(session.id, { archived }, idToken);
      setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, archived } : s));
      toast.success(archived ? "Session archived." : "Session unarchived.");
    } catch {
      toast.error("Failed to update session.");
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await deleteSession(id, idToken);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (detailSession?.id === id) setDetailSession(null);
      toast.success("Session deleted.");
    } catch {
      toast.error("Failed to delete session.");
    }
    setDeleteTarget(null);
  }

  async function handleExport(session: SavedSession) {
    let full = session;
    if (!session.finalAnswer && user) {
      try {
        const idToken = await user.getIdToken();
        full = await getSession(session.id, idToken);
      } catch {
        // use partial data
      }
    }
    const md = exportSessionAsMarkdown(full);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brain-${session.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Session exported.");
  }

  async function handleShare(session: SavedSession) {
    if (!user) { toast.error("Sign in to share sessions."); return; }
    if (session.shareId) {
      const url = `${window.location.origin}/report/${session.shareId}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard.");
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const url = await generateShareLink(session.id, idToken);
      const newShareId = url.split("/").pop();
      setSessions((prev) => prev.map((s) =>
        s.id === session.id ? { ...s, shared: true, shareId: newShareId } : s
      ));
      await navigator.clipboard.writeText(url);
      toast.success("Share link created and copied to clipboard.", {
        description: "Anyone with the link can view this session.",
      });
    } catch {
      toast.error("Failed to generate share link.");
    }
  }

  // Unique templates present in loaded sessions
  const uniqueTemplateIds = [...new Set(sessions.map((s) => s.templateId))];
  const hasCustom = uniqueTemplateIds.includes(null);
  const uniqueNamed = uniqueTemplateIds.filter((id): id is string => id !== null);

  const filtered = sessions.filter((s) => {
    if (tabView === "starred") return s.starred === true && !s.archived;
    if (tabView === "archived") return s.archived === true;
    return !s.archived;
  }).filter((s) => {
    if (templateFilter === "all") return true;
    // "custom" means null templateId
    if (templateFilter === "__custom__") return s.templateId == null;
    return s.templateId === templateFilter;
  }).filter((s) => {
    if (!search.trim()) return true;
    return (
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.question.toLowerCase().includes(search.toLowerCase())
    );
  });

  if (!firebaseReady || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <History className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Session history unavailable</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Sign in and connect Firebase to save and retrieve your session history.
        </p>
        <Button onClick={() => setLocation("/sign-in")} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader variant="app" />
      <main className="flex-1">
      <div className="main-inner">
      <section className="section">

        {/* ── Page hero ── */}
        <div className="row row-sb" style={{ paddingTop: "var(--sv)", paddingBottom: "calc(var(--sv) * 0.5)" }}>
          <div className="flex-row">
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <History style={{ width: 22, height: 22, color: "hsl(var(--primary))" }} />
            </div>
            <div>
              <p className="eyebrow">Sessions</p>
              <h1 className="section-title" style={{ margin: 0 }}>Session History</h1>
              <p className="section-body" style={{ marginTop: "0.25rem" }}>
                {sessions.filter((s) => !s.archived).length} session{sessions.filter((s) => !s.archived).length !== 1 ? "s" : ""}
                {hasMore ? "+" : ""} saved
              </p>
            </div>
          </div>
          <Button
            onClick={() => setLocation("/session")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shrink-0"
          >
            New session
          </Button>
        </div>

        {/* Tabs + search */}
        <div className="row flex-wrap" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}
             data-sm-row="true">
          <div className="flex items-center gap-1 bg-card/60 border border-border/60 rounded-lg p-1">
            {(["all", "starred", "archived"] as TabView[]).map((t) => (
              <button
                key={t}
                onClick={() => setTabView(t)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors",
                  tabView === t
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "starred" ? "⭐ Starred" : t === "archived" ? "📦 Archived" : "All"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-border/60 h-9"
              />
            </div>

            {(uniqueNamed.length > 0 || hasCustom) && (
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select
                  value={templateFilter}
                  onChange={(e) => setTemplateFilter(e.target.value)}
                  className="text-xs bg-card border border-border/60 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="all">All templates</option>
                  {hasCustom && <option value="__custom__">Custom (no template)</option>}
                  {uniqueNamed.map((tid) => (
                    <option key={tid} value={tid}>
                      {getTemplateName(tid)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl border border-border/50 bg-card/30 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <History className="w-10 h-10 text-muted-foreground/30 mb-3" />
            {sessions.length === 0 ? (
              <>
                <p className="text-muted-foreground text-sm mb-2">No sessions yet.</p>
                <Button
                  onClick={() => setLocation("/session")}
                  variant="outline"
                  className="gap-2 border-primary/30 text-primary"
                >
                  Start your first session
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">No sessions match your filters.</p>
                <button
                  onClick={() => { setSearch(""); setTabView("all"); setTemplateFilter("all"); }}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              <div className="flex flex-col gap-2">
                {filtered.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onOpen={() => openDetail(session)}
                    onRename={(title) => handleRename(session.id, title)}
                    onToggleStar={() => handleToggleStar(session)}
                    onToggleArchive={() => handleToggleArchive(session)}
                    onDelete={() => setDeleteTarget(session.id)}
                    onExport={() => handleExport(session)}
                    onShare={() => handleShare(session)}
                  />
                ))}
              </div>
            </AnimatePresence>

            {/* Load more */}
            {hasMore && !search && templateFilter === "all" && tabView === "all" && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="outline"
                  onClick={() => loadSessions(nextCursor, true)}
                  disabled={loadingMore}
                  className="gap-2 border-border/60"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </section>
      </div>

      {/* Session detail sheet */}
      {detailSession && (
        <SessionDetail session={detailSession} onClose={() => setDetailSession(null)} />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This session and all its content will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </main>
      <SiteFooter variant="app" />
    </div>
  );
}
