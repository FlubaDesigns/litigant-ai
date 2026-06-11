import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Search, Briefcase, Globe, TrendingUp, Code2, FileText,
  BookOpen, Stethoscope, Scale, FlaskConical, ArrowRight,
  Zap, LayoutTemplate, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TEMPLATES as STATIC_TEMPLATES, TEMPLATE_CATEGORIES, type Template } from "@/data/templates";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch(`${API_BASE}/templates`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Globe, TrendingUp, Code2, FileText,
  BookOpen, Stethoscope, Scale, Search, FlaskConical,
};

const CATEGORY_COLORS: Record<string, string> = {
  business: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  technical: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  personal: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  research: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  writing: "text-rose-400 border-rose-400/30 bg-rose-400/10",
};

const CATEGORY_LABELS: Record<string, string> = {
  business: "Business",
  technical: "Technical",
  personal: "Personal",
  research: "Research",
  writing: "Writing",
};

function TemplateCard({ template, onUse }: { template: Template; onUse: () => void }) {
  const Icon = ICON_MAP[template.icon] ?? Briefcase;
  const colorClass = CATEGORY_COLORS[template.category] ?? "text-muted-foreground border-border/30 bg-muted/10";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group relative flex flex-col rounded-xl border border-border/60 bg-card/60 hover:border-primary/40 hover:bg-primary/5 p-5 transition-all duration-200"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="mt-0.5 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight mb-1">{template.title}</h3>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-medium px-1.5 py-0 h-4", colorClass)}
          >
            {CATEGORY_LABELS[template.category] ?? template.category}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground shrink-0">
          <Zap className="w-3 h-3 text-primary/60" />
          ~{template.estimatedCredits}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
        {template.description}
      </p>

      <div className="border-t border-border/40 pt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {template.inputFields?.length ?? 0} input{(template.inputFields?.length ?? 0) !== 1 ? "s" : ""}
          {template.defaultConfig ? ` · ${template.defaultConfig.courtMode} mode` : ""}
        </div>
        <Button
          size="sm"
          onClick={onUse}
          className="h-7 px-3 text-xs gap-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/30 transition-all"
        >
          Use Template
          <ArrowRight className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
}

export default function TemplatesPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [templates, setTemplates] = useState<Template[]>(STATIC_TEMPLATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates()
      .then((data) => {
        if (!cancelled && data.length > 0) setTemplates(data);
      })
      .catch(() => {
        // fallback: keep static templates
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Derive categories from the live template list
  const presentCategories = TEMPLATE_CATEGORIES.filter((cat) =>
    templates.some((t) => t.category === cat.id)
  );

  const filtered = templates.filter((t) => {
    const matchesCategory = activeCategory === "all" || t.category === activeCategory;
    const matchesSearch =
      !search.trim() ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  function handleUse(template: Template) {
    setLocation(`/session?templateId=${template.id}`);
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <LayoutTemplate className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
            {loading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
          </div>
          <p className="text-muted-foreground text-sm">
            Choose a template to pre-configure the courtroom for your use case. Each template optimises the AI roles, debate mode, and output format.
          </p>
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border/60"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeCategory === "all"
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
              )}
            >
              All ({templates.length})
            </button>
            {presentCategories.map(({ id, label }) => {
              const count = templates.filter((t) => t.category === id).length;
              return (
                <button
                  key={id}
                  onClick={() => setActiveCategory(id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    activeCategory === id
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
                  )}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Search className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No templates match your search.</p>
            <button
              onClick={() => { setSearch(""); setActiveCategory("all"); }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={() => handleUse(template)}
              />
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-10 rounded-xl border border-primary/20 bg-primary/5 p-5 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-sm">Start without a template</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You can ask anything directly. Templates just configure the courtroom for you.
            </p>
          </div>
          <Button
            onClick={() => setLocation("/session")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-2"
          >
            Open session
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
