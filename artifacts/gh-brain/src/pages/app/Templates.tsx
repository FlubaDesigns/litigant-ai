import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical, Zap, ChevronRight,
  LayoutTemplate, SearchX,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES as STATIC_TEMPLATES, TEMPLATE_CATEGORIES, type Template } from "@/data/templates";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical,
};

// ── Category styling ──────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  business:  "border-amber-500/40  text-amber-400  bg-amber-500/10",
  technical: "border-blue-500/40   text-blue-400   bg-blue-500/10",
  personal:  "border-purple-500/40 text-purple-400 bg-purple-500/10",
  research:  "border-cyan-500/40   text-cyan-400   bg-cyan-500/10",
  writing:   "border-rose-500/40   text-rose-400   bg-rose-500/10",
};

function categoryLabel(cat: string) {
  return TEMPLATE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
}

const RESPONSE_MODE_LABELS: Record<string, string> = {
  balanced:  "Balanced",
  thorough:  "Thorough",
  concise:   "Concise",
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchTemplates(): Promise<Template[]> {
  try {
    const res = await fetch(`${API_BASE}/templates`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list: Template[] = Array.isArray(data) ? data : data.templates ?? [];
    if (list.length === 0) throw new Error("empty");
    return list;
  } catch {
    return STATIC_TEMPLATES;
  }
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({ template, onClick }: { template: Template; onClick: () => void }) {
  const Icon = ICON_MAP[template.icon] ?? Briefcase;
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group text-left w-full rounded-xl border border-border/60 bg-card/50 hover:border-primary/40 hover:bg-primary/5 p-4 transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold truncate">{template.title}</span>
            <span className="ml-auto text-xs font-mono text-muted-foreground shrink-0">
              ~{template.estimatedCredits}cr
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {template.description}
          </p>
          <div className="mt-2">
            <span className={cn(
              "inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide",
              CATEGORY_COLORS[template.category] ?? "border-border text-muted-foreground"
            )}>
              {categoryLabel(template.category)}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ── Detail sheet ──────────────────────────────────────────────────────────────
function TemplateDetail({ template, onClose, onLaunch }: {
  template: Template;
  onClose: () => void;
  onLaunch: () => void;
}) {
  const Icon = ICON_MAP[template.icon] ?? Briefcase;
  const cfg = template.defaultConfig;

  const configPills = [
    `${cfg.litigantCount} litigants`,
    `${cfg.confidenceTarget ?? 80}% target`,
    cfg.debateMode,
    cfg.courtMode,
    RESPONSE_MODE_LABELS[cfg.responseMode ?? "balanced"] ?? cfg.responseMode,
  ].filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <SheetTitle className="text-base font-bold text-foreground leading-tight">
              {template.title}
            </SheetTitle>
            <span className={cn(
              "inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide mt-0.5",
              CATEGORY_COLORS[template.category] ?? "border-border text-muted-foreground"
            )}>
              {categoryLabel(template.category)}
            </span>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {template.description}
        </p>

        {/* Input fields preview */}
        {template.inputFields.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary/60">
              You'll fill in
            </div>
            <div className="space-y-1.5">
              {template.inputFields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card/30"
                >
                  <div className="flex-1">
                    <span className="text-xs font-medium text-foreground">{f.label}</span>
                    {f.required && (
                      <span className="ml-1.5 text-[10px] text-primary/60 font-mono">required</span>
                    )}
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                      {f.placeholder}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Court config */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary/60">
            Court Configuration
          </div>
          <div className="flex flex-wrap gap-1.5">
            {configPills.map((pill) => (
              <span
                key={pill}
                className="px-2.5 py-1 border border-primary/25 rounded-lg text-[11px] text-primary/70 bg-primary/5 capitalize"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>

        {/* Credit estimate */}
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Estimated cost</span>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold text-primary font-mono">
              ~{template.estimatedCredits} credits
            </span>
          </div>
        </div>
      </div>

      {/* Launch button */}
      <div className="px-5 pb-5 pt-3 border-t border-border/50 shrink-0 space-y-2">
        <Button
          onClick={onLaunch}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-2"
        >
          Launch in Court
          <ChevronRight className="w-4 h-4" />
        </Button>
        <p className="text-[11px] text-center text-muted-foreground/60">
          You'll fill in your details on the next screen
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const [, navigate] = useLocation();
  const [templates, setTemplates] = useState<Template[]>(STATIC_TEMPLATES);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Template | null>(null);

  // Fetch from API (falls back to static if unavailable)
  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => {});
  }, []);

  // Filter: category + keyword search
  const filtered = useMemo(() => {
    let list = activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          categoryLabel(t.category).toLowerCase().includes(q)
      );
    }
    return list;
  }, [templates, activeCategory, searchQuery]);

  // Count per category (from full list, not filtered)
  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of templates) {
      map[t.category] = (map[t.category] ?? 0) + 1;
    }
    return map;
  }, [templates]);

  function handleLaunch() {
    if (!selected) return;
    navigate(`/session?templateId=${selected.id}`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader variant="app" />
      <main className="flex-1">
        <div className="main-inner">
          <section className="section">

            {/* ── Page header ── */}
            <div className="row" style={{ paddingTop: "var(--sv)", paddingBottom: "calc(var(--sv) * 0.5)" }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center">
                  <LayoutTemplate className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
                  <p className="text-sm text-muted-foreground">
                    Pre-configured courts for common tasks — pick one and go.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Search + category filters ── */}
            <div className="row" style={{ paddingBottom: "1.25rem" }}>
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search templates…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm bg-card/40 border-border/60 focus:border-primary/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              {/* Category pills */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors",
                    activeCategory === "all"
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  All ({templates.length})
                </button>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors",
                      activeCategory === cat.id
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    {cat.label} ({countByCategory[cat.id] ?? 0})
                  </button>
                ))}
              </div>
            </div>

            {/* ── Template grid ── */}
            <div className="row" style={{ paddingBottom: "var(--sv)" }}>
              <AnimatePresence mode="popLayout">
                {filtered.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground"
                  >
                    <SearchX className="w-8 h-8 opacity-40" />
                    <p className="text-sm">No templates match your search.</p>
                    <button
                      onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Clear filters
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`${activeCategory}-${searchQuery}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {filtered.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onClick={() => setSelected(template)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </section>
        </div>
      </main>
      <SiteFooter variant="app" />

      {/* ── Detail sheet ── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full max-w-sm bg-[#060e06] border-l-2 border-primary/40 p-0 flex flex-col"
        >
          {selected && (
            <TemplateDetail
              template={selected}
              onClose={() => setSelected(null)}
              onLaunch={handleLaunch}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
