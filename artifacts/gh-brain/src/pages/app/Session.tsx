import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical, Settings2, Play, Square,
  ThumbsUp, ThumbsDown, AlertTriangle, Copy, Download, ChevronDown,
  Zap, Target, RotateCcw, CheckCircle2, Sparkles, MessageSquare, X,
  Printer, Package, ShoppingCart, Cpu, LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBrainSession, type FeedItem } from "@/hooks/useBrainSession";
import { TEMPLATES, TEMPLATE_CATEGORIES, type Template } from "@/data/templates";
import type { CourtConfig, ProviderName } from "@/data/templates";
import { submitFeedback } from "@/services/feedbackService";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useLocation } from "wouter";
import {
  getProviders, PROVIDER_LABELS, PROVIDER_ICONS, estimateCredits,
  type ProviderInfo, type ModelInfo, type ModelCreditInfo,
} from "@/services/providerService";
import { Input } from "@/components/ui/input";
import { CourtDiagram } from "@/components/CourtDiagram";

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical,
};

// ── Role colours ──────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  Orchestrator: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  Verdict: "text-primary border-primary/30 bg-primary/5",
  Advocate: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  Skeptic: "text-red-400 border-red-400/30 bg-red-400/5",
  "Devil's Advocate": "text-orange-400 border-orange-400/30 bg-orange-400/5",
  Empiricist: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  Questioner: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  Defender: "text-green-400 border-green-400/30 bg-green-400/5",
  Synthesizer: "text-primary border-primary/30 bg-primary/5",
  Logician: "text-indigo-400 border-indigo-400/30 bg-indigo-400/5",
  Analyst: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  Contrarian: "text-orange-400 border-orange-400/30 bg-orange-400/5",
  Realist: "text-gray-400 border-gray-400/30 bg-gray-400/5",
  Futurist: "text-violet-400 border-violet-400/30 bg-violet-400/5",
  Critic: "text-red-400 border-red-400/30 bg-red-400/5",
  "Balanced Reviewer": "text-teal-400 border-teal-400/30 bg-teal-400/5",
  "Standards Expert": "text-amber-400 border-amber-400/30 bg-amber-400/5",
};

function getRoleStyle(role: string) {
  return ROLE_COLORS[role] ?? "text-muted-foreground border-border/50 bg-muted/10";
}

// ── TemplateCard ──────────────────────────────────────────────────────────────
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
        </div>
      </div>
    </motion.button>
  );
}

// ── ConfigPanel ───────────────────────────────────────────────────────────────
function ConfigPanel({
  open, onClose, config, onChange,
}: {
  open: boolean;
  onClose: () => void;
  config: CourtConfig;
  onChange: (c: Partial<CourtConfig>) => void;
}) {
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    if (open) {
      getProviders().then((p) => setAvailableProviders(p.providers));
    }
  }, [open]);

  const selectedProvider = availableProviders.find((p) => p.name === config.provider)
    ?? availableProviders[0];

  const selectedModel: ModelInfo | undefined = selectedProvider?.models.find(
    (m) => m.id === (config.model ?? selectedProvider.defaultModel)
  ) ?? selectedProvider?.models[0];

  const estimatedCredits = selectedModel?.creditInfo
    ? estimateCredits(
        selectedModel.creditInfo,
        config.litigantCount,
        config.maxIterations,
        config.responseMode
      )
    : config.litigantCount * config.maxIterations * 3 + 6;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-80 bg-card border-l border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            Court Configuration
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">

          {/* ── AI Provider ── */}
          {availableProviders.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                <Cpu className="w-3 h-3" /> AI Provider
              </label>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {availableProviders.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => onChange({ provider: p.name as ProviderName, model: p.defaultModel })}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all",
                      config.provider === p.name || (!config.provider && p === availableProviders[0])
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    <span>{PROVIDER_ICONS[p.name as ProviderName]}</span>
                    {PROVIDER_LABELS[p.name as ProviderName]}
                  </button>
                ))}
              </div>
              {selectedProvider && selectedProvider.models.length > 0 && (
                <Select
                  value={config.model ?? selectedProvider.defaultModel}
                  onValueChange={(v) => onChange({ model: v })}
                >
                  <SelectTrigger className="bg-background border-border/60 text-xs h-8">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProvider.models.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Court Mode
            </label>
            <Select value={config.courtMode} onValueChange={(v) => onChange({ courtMode: v as CourtConfig["courtMode"] })}>
              <SelectTrigger className="bg-background border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adversarial">⚔️ Adversarial — debate</SelectItem>
                <SelectItem value="socratic">❓ Socratic — questioning</SelectItem>
                <SelectItem value="analysis">🔬 Analysis — examination</SelectItem>
                <SelectItem value="critique">🔍 Critique — review</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {config.courtMode === "adversarial" && "AI roles argue for and against the proposition."}
              {config.courtMode === "socratic" && "Questioner probes assumptions, Defender clarifies."}
              {config.courtMode === "analysis" && "Each AI examines a different analytical dimension."}
              {config.courtMode === "critique" && "Structured criticism and defense of the subject."}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
              Litigants — {config.litigantCount}
            </label>
            <Slider
              min={2} max={4} step={1}
              value={[config.litigantCount]}
              onValueChange={([v]) => onChange({ litigantCount: v })}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>2 fast</span><span>3 balanced</span><span>4 thorough</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
              Confidence Target — {config.confidenceTarget}%
            </label>
            <Slider
              min={60} max={95} step={5}
              value={[config.confidenceTarget]}
              onValueChange={([v]) => onChange({ confidenceTarget: v })}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>60% quick</span><span>80% standard</span><span>95% deep</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
              Max Rounds — {config.maxIterations}
            </label>
            <Slider
              min={1} max={4} step={1}
              value={[config.maxIterations]}
              onValueChange={([v]) => onChange({ maxIterations: v })}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1 round</span><span>2–3</span><span>4 deep</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Response Depth
            </label>
            <Select value={config.responseMode} onValueChange={(v) => onChange({ responseMode: v as CourtConfig["responseMode"] })}>
              <SelectTrigger className="bg-background border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise — fast, brief</SelectItem>
                <SelectItem value="balanced">Balanced — standard</SelectItem>
                <SelectItem value="thorough">Thorough — detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Output Format
            </label>
            <Select value={config.outputFormat} onValueChange={(v) => onChange({ outputFormat: v as CourtConfig["outputFormat"] })}>
              <SelectTrigger className="bg-background border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="report">Analytical Report</SelectItem>
                <SelectItem value="memo">Decision Memo</SelectItem>
                <SelectItem value="bullets">Bullet Points</SelectItem>
                <SelectItem value="verdict">Direct Verdict</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5">
            <div className="text-xs text-muted-foreground">Estimated credit cost</div>
            <div className="text-2xl font-bold text-primary font-mono">
              ~{estimatedCredits} credits
            </div>
            <div className="text-xs text-muted-foreground">
              = ${(estimatedCredits * 0.01).toFixed(2)} USD
            </div>
            {selectedModel?.creditInfo && (
              <div className="text-xs text-muted-foreground/70 pt-1 border-t border-border/40">
                {selectedModel.label} · {selectedModel.creditInfo.multiplier}× margin
              </div>
            )}
          </div>

          <Button onClick={onClose} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            Save Configuration
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── FeedItemCard ──────────────────────────────────────────────────────────────
function FeedItemCard({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(true);
  const style = getRoleStyle(item.role);
  const isVerdict = item.role === "Verdict";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border p-4 text-sm",
        isVerdict ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card/60",
      )}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Badge variant="outline" className={cn("text-xs shrink-0 font-semibold", style)}>
          {item.role}
        </Badge>
        {item.round > 0 && item.round < 99 && (
          <span className="text-xs text-muted-foreground">Round {item.round}</span>
        )}
        {!item.isComplete && (
          <span className="flex gap-0.5 items-center ml-1">
            <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        )}
        {item.isComplete && <CheckCircle2 className="w-3 h-3 text-primary/50 ml-auto shrink-0" />}
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted-foreground shrink-0 transition-transform",
            item.isComplete ? "ml-0" : "ml-auto",
            !expanded && "-rotate-90"
          )}
        />
      </button>
      <AnimatePresence>
        {expanded && item.content && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
              {item.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function buildMarkdown(state: ReturnType<typeof useBrainSession>["state"]): string {
  return [
    `# Litigant AI Session Report`,
    ``,
    `**Question:** ${state.question}`,
    state.template ? `**Template:** ${state.template.title}` : null,
    `**Confidence:** ${state.confidence}%`,
    `**Credits Used:** ${state.creditsUsed}`,
    `**Date:** ${new Date().toLocaleDateString()}`,
    ``,
    `---`,
    ``,
    `## Final Answer`,
    ``,
    state.finalAnswer || "_No final answer generated._",
    ``,
    `---`,
    ``,
    `## Artifacts`,
    ``,
    state.artifacts || "_No artifacts generated._",
    ``,
    `---`,
    ``,
    `## Debate Notes`,
    ``,
    state.debateNotes || "_No debate notes._",
    ``,
    `---`,
    ``,
    `## Sources & Caveats`,
    ``,
    state.caveats,
    ``,
    `---`,
    `*Generated by Litigant AI — Don't just ask AI. Put the question on trial.*`,
  ].filter(Boolean).join("\n");
}

function exportPDF(state: ReturnType<typeof useBrainSession>["state"], w: Window): void {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Litigant AI Session — ${state.question.slice(0, 60)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; color: #111; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
    .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; white-space: pre-wrap; font-size: 0.8rem; }
    .badge { display: inline-block; background: #00c853; color: #000; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>Litigant AI Session Report</h1>
  <div class="meta">
    <strong>Question:</strong> ${state.question}<br/>
    ${state.template ? `<strong>Template:</strong> ${state.template.title}<br/>` : ""}
    <strong>Confidence:</strong> <span class="badge">${state.confidence}%</span>
    &nbsp; <strong>Credits:</strong> ${state.creditsUsed}
    &nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}
  </div>
  <h2>Final Answer</h2>
  <pre>${state.finalAnswer || "No final answer generated."}</pre>
  ${state.artifacts ? `<h2>Artifacts</h2><pre>${state.artifacts}</pre>` : ""}
  <h2>Debate Notes</h2>
  <pre>${state.debateNotes || "No debate notes."}</pre>
  <h2>Sources &amp; Caveats</h2>
  <pre>${state.caveats}</pre>
  <p style="margin-top:2rem;color:#999;font-size:0.75rem;">Generated by Litigant AI — Don't just ask AI. Put the question on trial.</p>
</body>
</html>`;

  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SessionPage() {
  const { user, userProfile } = useAuth();
  const { credits, plan } = useUserProfile();
  const savedConfig = userProfile?.defaultSettings
    ? {
        courtMode:        userProfile.defaultSettings.courtMode as CourtConfig["courtMode"],
        litigantCount:    userProfile.defaultSettings.litigantCount ?? 3,
        confidenceTarget: userProfile.defaultSettings.confidenceTarget ?? 80,
        responseMode:     userProfile.defaultSettings.responseMode as CourtConfig["responseMode"],
        outputFormat:     userProfile.defaultSettings.outputFormat as CourtConfig["outputFormat"],
        provider:         (userProfile.defaultSettings.provider as CourtConfig["provider"]) ?? undefined,
      }
    : undefined;
  const { state, run, stop, reset, setQuestion, setTemplate, setConfig } = useBrainSession(savedConfig);
  const [, navigate] = useLocation();

  const [configOpen, setConfigOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [feedbackGiven, setFeedbackGiven] = useState<"good" | "bad" | "warn" | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [selectedCreditInfo, setSelectedCreditInfo] = useState<ModelCreditInfo | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Load provider credit info for accurate session cost estimate
  useEffect(() => {
    getProviders().then((data) => {
      const prov = data.providers.find((p) => p.name === state.config.provider) ?? data.providers[0];
      const model = prov?.models.find((m) => m.id === (state.config.model ?? prov?.defaultModel)) ?? prov?.models[0];
      setSelectedCreditInfo(model?.creditInfo ?? null);
    }).catch(() => {});
  }, [state.config.provider, state.config.model]);

  // Reset field values when template changes
  useEffect(() => {
    setFieldValues({});
  }, [state.template?.id]);

  // Pre-select template from ?templateId= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("templateId");
    if (tid && state.phase === "idle" && !state.template) {
      const template = TEMPLATES.find((t) => t.id === tid);
      if (template) {
        setTemplate(template);
        setConfig(template.defaultConfig);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll runtime feed
  useEffect(() => {
    if (feedRef.current && state.phase === "running") {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [state.runtimeFeed, state.phase]);

  /** Assemble a structured question from template input field values */
  function assembleFieldQuestion(): string {
    if (!state.template || state.template.inputFields.length === 0) return state.question;
    return state.template.inputFields
      .map((f) => (fieldValues[f.id]?.trim() ? `${f.label}: ${fieldValues[f.id].trim()}` : null))
      .filter(Boolean)
      .join("\n");
  }

  async function handleRun() {
    const hasFields = state.template && state.template.inputFields.length > 0;
    let effectiveQuestion = hasFields ? assembleFieldQuestion() : state.question;

    if (hasFields) {
      const missing = state.template!.inputFields.filter((f) => f.required && !fieldValues[f.id]?.trim());
      if (missing.length > 0) {
        toast.error(`Please fill in: ${missing.map((f) => f.label).join(", ")}`);
        return;
      }
    }

    if (!effectiveQuestion.trim()) {
      toast.error("Please enter a question first.");
      return;
    }
    if (userProfile && userProfile.creditBalance < estimatedCredits) {
      toast.error(`You need at least ${estimatedCredits} credits to run this session.`, {
        action: { label: "Buy Credits", onClick: () => navigate("/billing") },
      });
      return;
    }
    setFeedbackGiven(null);
    await run(effectiveQuestion !== state.question ? effectiveQuestion : undefined);
  }

  function handleReset() {
    reset();
    setFeedbackGiven(null);
  }

  function handleCopyMarkdown() {
    navigator.clipboard.writeText(buildMarkdown(state));
    toast.success("Copied to clipboard.");
  }

  function handleDownloadMarkdown() {
    const blob = new Blob([buildMarkdown(state)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brain-session-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  }

  function handleExportPDF() {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to print/save as PDF.");
      return;
    }
    exportPDF(state, w);
  }

  function handleStop() {
    stop();
    toast.info("Session stopped. Partial results are shown below.");
  }

  async function handleFeedback(rating: "good" | "bad" | "warn") {
    setFeedbackGiven(rating);
    try {
      await submitFeedback({
        userId: user?.uid ?? null,
        sessionId: state.sessionId,
        turnId: state.sessionId ?? `anon-${Date.now()}`,
        role: "Verdict",
        rating,
      });
      toast.success("Feedback recorded — thank you.");
    } catch {
      toast.error("Failed to save feedback.");
    }
  }

  const isRunning = state.phase === "running";
  const isComplete = state.phase === "complete";
  const isError = state.phase === "error";
  const isIdle = state.phase === "idle";

  const estimatedCredits = selectedCreditInfo
    ? estimateCredits(selectedCreditInfo, state.config.litigantCount, state.config.maxIterations, state.config.responseMode)
    : state.config.litigantCount * state.config.maxIterations * 3 + 6;

  // Live credit health — from Firestore via useUserProfile (updates as backend deducts)
  const creditsCritical = credits < 10;
  const creditsLow = credits < 50 && !creditsCritical;
  const insufficientCredits = credits < estimatedCredits;
  const sessionsLeft = estimatedCredits > 0 ? Math.floor(credits / estimatedCredits) : 0;

  const filteredTemplates =
    activeCategory === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === activeCategory);

  return (
    <div
      className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden"
      style={{ background: "radial-gradient(circle at top, #102010, #070f07 56%, #020402)" }}
    >
      <ConfigPanel open={configOpen} onClose={() => setConfigOpen(false)} config={state.config} onChange={setConfig} />

      {/* ── TOP BAR — always visible, adapts to phase ── */}
      <div className="shrink-0 border-b border-white/5 bg-black/40 backdrop-blur-sm px-3 py-2 flex items-start gap-2">
        {isIdle ? (
          <>
            <div className="flex-1 min-w-0">
              {state.template && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Badge variant="outline" className="text-primary border-primary/40 bg-primary/10 text-[10px] h-5">
                    {state.template.title}
                  </Badge>
                  <button onClick={() => setTemplate(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {state.template && state.template.inputFields.length > 0 ? (
                <div className="space-y-1.5">
                  {state.template.inputFields.map((field) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground shrink-0 w-20 truncate">{field.label}</span>
                      <Input
                        type={field.type === "url" ? "url" : "text"}
                        placeholder={field.placeholder}
                        value={fieldValues[field.id] ?? ""}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
                        className="h-7 text-xs bg-transparent border-white/10 focus-visible:ring-1 focus-visible:ring-primary/50 flex-1"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <Textarea
                  placeholder="What do you want to put on trial?"
                  value={state.question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
                  rows={2}
                  className="w-full resize-none text-sm bg-transparent border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40 leading-relaxed min-h-0"
                />
              )}
            </div>
            <div className="shrink-0 flex flex-col gap-1 items-end pt-0.5">
              <Button
                onClick={handleRun}
                disabled={(!state.question.trim() && !(state.template && state.template.inputFields.length > 0)) || insufficientCredits}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 h-8 px-4 text-xs font-semibold"
              >
                <Play className="w-3 h-3" />
                Run Trial
              </Button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTemplateSheetOpen(true)}
                  className="text-[10px] text-muted-foreground/60 hover:text-primary flex items-center gap-1 transition-colors px-1.5 py-1 rounded border border-white/5 hover:border-primary/30"
                >
                  <LayoutTemplate className="w-3 h-3" />
                  Templates
                </button>
                <button
                  onClick={() => setConfigOpen(true)}
                  className="text-[10px] text-muted-foreground/60 hover:text-primary flex items-center gap-1 transition-colors px-1.5 py-1 rounded border border-white/5 hover:border-primary/30"
                >
                  <Settings2 className="w-3 h-3" />
                  <span className="capitalize">{state.config.courtMode}</span>
                  <span className="opacity-40">·</span>
                  <span>{state.config.litigantCount}×</span>
                  <span className="opacity-40">·</span>
                  <span>{state.config.confidenceTarget}%</span>
                </button>
              </div>
            </div>
          </>
        ) : isRunning || state.phase === "paused" ? (
          <>
            <Brain className="w-4 h-4 text-primary shrink-0 animate-pulse mt-0.5" />
            <p className="flex-1 text-sm text-muted-foreground/80 truncate min-w-0 leading-tight">{state.question}</p>
            {state.currentRound > 0 && state.currentRound < 99 && (
              <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-mono text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Revolution {state.currentRound} / {state.config.maxIterations}
              </div>
            )}
            <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5 h-7 text-xs shrink-0">
              <Square className="w-3 h-3" />
              Stop
            </Button>
          </>
        ) : (
          <>
            {isComplete
              ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
            <p className="flex-1 text-sm truncate min-w-0 leading-tight">{state.question}</p>
            {isComplete && (
              <div className="shrink-0 flex items-center gap-2 text-xs font-mono">
                <span className="text-primary flex items-center gap-0.5"><Target className="w-3 h-3" />{state.confidence}%</span>
                <span className="text-muted-foreground flex items-center gap-0.5"><Zap className="w-3 h-3" />{state.creditsUsed} cr · {credits} left</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 h-7 text-xs shrink-0 border-white/10">
              <RotateCcw className="w-3 h-3" />
              New
            </Button>
          </>
        )}
      </div>

      {/* ── CREDIT WARNING STRIP (idle only) ── */}
      {isIdle && (creditsCritical || creditsLow || insufficientCredits) && (
        <div className={cn(
          "shrink-0 px-3 py-1.5 flex items-center gap-2 text-xs border-b",
          insufficientCredits || creditsCritical
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
        )}>
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>
            {insufficientCredits
              ? <>Need ~{estimatedCredits} cr · you have <strong>{credits}</strong>.</>
              : creditsCritical
              ? <>Critical: only <strong>{credits}</strong> credits left.</>
              : <>Low: <strong>{credits}</strong> credits (~{sessionsLeft} sessions).</>
            }
          </span>
          <button onClick={() => navigate("/billing")} className="ml-auto underline underline-offset-2 font-medium">
            Top up →
          </button>
        </div>
      )}

      {/* ── COURT DIAGRAM — always visible, always the hero ── */}
      <div className="shrink-0 relative" style={{ height: "clamp(240px, 44vh, 500px)" }}>
        <CourtDiagram
          activeRole={state.activeRole}
          litigantCount={state.config.litigantCount}
          running={isRunning}
          confidence={state.confidence}
          creditsUsed={state.creditsUsed}
          estimatedCredits={state.estimatedCredits}
          complete={isComplete}
        />

        {/* Revolution counter — overlaid top-left */}
        {(isRunning || isComplete) && state.currentRound > 0 && state.currentRound < 99 && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 border border-primary/25 text-[10px] font-mono text-primary/80 pointer-events-none backdrop-blur-sm">
            <span className={cn("w-1.5 h-1.5 rounded-full bg-primary", isRunning && "animate-pulse")} />
            Revolution {state.currentRound} / {state.config.maxIterations}
          </div>
        )}

        {/* Live credit chip — overlaid top-right (Firestore live via useUserProfile) */}
        {(isRunning || isComplete) && (
          <div className={cn(
            "absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 border text-[10px] font-mono pointer-events-none backdrop-blur-sm transition-colors",
            creditsCritical ? "border-red-500/40 text-red-400"
            : creditsLow ? "border-yellow-500/40 text-yellow-400"
            : "border-primary/25 text-primary/70"
          )}>
            <Zap className="w-2.5 h-2.5" />
            {credits} cr
          </div>
        )}

        {/* Idle state — config summary overlay at bottom */}
        {isIdle && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/8 text-[10px] font-mono text-muted-foreground/60 pointer-events-none backdrop-blur-sm whitespace-nowrap">
            <span className="capitalize">{state.config.courtMode}</span>
            <span className="opacity-30">·</span>
            <span>{state.config.litigantCount} litigants</span>
            <span className="opacity-30">·</span>
            <span>{state.config.confidenceTarget}% target</span>
            <span className="opacity-30">·</span>
            <span>~{estimatedCredits} cr</span>
            <span className="opacity-30">·</span>
            <span className={cn(creditsCritical ? "text-red-400" : creditsLow ? "text-yellow-400" : "text-primary/60")}>
              {credits} available
            </span>
          </div>
        )}
      </div>

      {/* ── CONFIDENCE + CREDITS STATUS STRIP (running / complete) ── */}
      {!isIdle && (
        <div className="shrink-0 px-3 py-1.5 border-y border-white/5 bg-black/30 flex items-center gap-3">
          <span className="text-[9px] font-mono text-primary/50 uppercase tracking-wider shrink-0">Conf</span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${state.confidence}%`,
                background: state.confidence >= state.config.confidenceTarget
                  ? "#00c853"
                  : "rgba(0,200,83,0.6)",
              }}
            />
          </div>
          <span className={cn(
            "text-[10px] font-mono font-bold tabular-nums shrink-0",
            state.confidence >= state.config.confidenceTarget ? "text-primary" : "text-primary/60"
          )}>
            {state.confidence}%<span className="text-muted-foreground/40 font-normal">/{state.config.confidenceTarget}%</span>
          </span>
          <span className="text-white/10 shrink-0">|</span>
          <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
            {state.creditsUsed > 0 ? `${state.creditsUsed} used` : `~${estimatedCredits} est`}
          </span>
        </div>
      )}

      {/* ── BOTTOM PANEL ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

        {/* IDLE — prompt to ask a question */}
        {isIdle && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-mono text-primary/70">
              <Sparkles className="w-3 h-3" />
              Don't just ask AI. Put the question on trial.
            </div>
            <p className="text-xs text-muted-foreground/50 max-w-sm">
              Type your question above, pick a template, or adjust the court configuration — then press <strong className="text-primary/70">Run Trial</strong>.
            </p>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono mt-1",
              creditsCritical ? "border-red-500/30 bg-red-500/10 text-red-400"
              : creditsLow ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
              : "border-primary/20 bg-primary/5 text-primary/60"
            )}>
              <Zap className="w-2.5 h-2.5" />
              {credits} credits · {plan}
              {insufficientCredits && (
                <button onClick={() => navigate("/billing")} className="ml-1 underline underline-offset-2">top up</button>
              )}
            </div>
          </div>
        )}

        {/* RUNNING — live feed streaming in real time */}
        {(isRunning || state.phase === "paused") && (
          <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {state.activeRole && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono sticky top-0 bg-[#070f07]/90 backdrop-blur py-1 z-10 border-b border-white/5">
                <span className="text-primary animate-pulse">▸</span>
                <span className="text-primary/80">{state.activeRole}</span>
                <span className="opacity-40">deliberating</span>
                <span className="flex gap-0.5 ml-1">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              </div>
            )}
            <AnimatePresence>
              {state.runtimeFeed.map((item) => (
                <FeedItemCard key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* COMPLETE / ERROR — results */}
        {(isComplete || isError) && (
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
                <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
                <p className="font-semibold mb-2">Session Error</p>
                <p className="text-sm text-muted-foreground mb-4">{state.errorMessage}</p>
                <Button onClick={handleReset} variant="outline">Try Again</Button>
              </div>
            ) : (
              <>
                {/* Credit summary after session */}
                <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg border border-primary/15 bg-primary/5 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">Session complete —</span>
                  <span className="font-mono text-primary">{state.creditsUsed} credits used</span>
                  <span className="text-muted-foreground">·</span>
                  <span className={cn(
                    "font-mono",
                    creditsCritical ? "text-red-400" : creditsLow ? "text-yellow-400" : "text-muted-foreground"
                  )}>
                    {credits} remaining
                  </span>
                  {(creditsCritical || creditsLow) && (
                    <button onClick={() => navigate("/billing")} className="ml-auto text-primary underline underline-offset-2">Top up</button>
                  )}
                </div>

                {/* Feedback + Export bar */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    Helpful?
                  </span>
                  {(["good", "bad", "warn"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleFeedback(r)}
                      disabled={feedbackGiven !== null}
                      className={cn(
                        "w-7 h-7 rounded-lg border flex items-center justify-center transition-colors",
                        feedbackGiven === r
                          ? r === "good" ? "border-primary/50 bg-primary/10 text-primary"
                          : r === "bad" ? "border-destructive/50 bg-destructive/10 text-destructive"
                          : "border-yellow-500/50 bg-yellow-500/10 text-yellow-500"
                          : "border-border/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {r === "good" && <ThumbsUp className="w-3.5 h-3.5" />}
                      {r === "bad" && <ThumbsDown className="w-3.5 h-3.5" />}
                      {r === "warn" && <AlertTriangle className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={handleCopyMarkdown} className="gap-1 h-7 text-xs border-white/10">
                      <Copy className="w-3 h-3" />Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadMarkdown} className="gap-1 h-7 text-xs border-white/10">
                      <Download className="w-3 h-3" />MD
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1 h-7 text-xs border-white/10">
                      <Printer className="w-3 h-3" />Print
                    </Button>
                  </div>
                </div>

                {/* Output tabs */}
                <Tabs defaultValue="answer">
                  <TabsList className="bg-black/30 border border-white/8 mb-3 flex-wrap h-auto gap-y-1">
                    <TabsTrigger value="answer" className="text-xs">Final Answer</TabsTrigger>
                    <TabsTrigger value="artifacts" className="text-xs">Artifacts</TabsTrigger>
                    <TabsTrigger value="debate" className="text-xs">Debate</TabsTrigger>
                    <TabsTrigger value="transcript" className="text-xs">Transcript</TabsTrigger>
                    <TabsTrigger value="caveats" className="text-xs">Caveats</TabsTrigger>
                  </TabsList>

                  <TabsContent value="answer">
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">Verdict</span>
                        <Badge variant="outline" className="ml-auto text-primary border-primary/30 text-xs">
                          {state.confidence}% confidence
                        </Badge>
                      </div>
                      <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {state.finalAnswer || "No final answer generated."}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="artifacts">
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-blue-400">Artifacts</span>
                      </div>
                      <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {state.artifacts || "No artifacts generated."}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="debate">
                    <div className="rounded-xl border border-border/40 bg-card/30 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Scale className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">Debate Notes</span>
                      </div>
                      <div className="text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap font-mono">
                        {state.debateNotes || "No debate notes recorded."}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="transcript">
                    <div className="rounded-xl border border-border/40 bg-card/30 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">Full Transcript</span>
                      </div>
                      <div className="space-y-4">
                        {state.runtimeFeed.filter((f) => f.content).map((f) => (
                          <div key={f.id} className="text-xs">
                            <span className={cn("font-bold font-mono", getRoleStyle(f.role).split(" ")[0])}>
                              {f.role}
                            </span>
                            {f.round > 0 && f.round < 99 && (
                              <span className="text-muted-foreground"> (Round {f.round})</span>
                            )}
                            <p className="mt-1 text-foreground/60 leading-relaxed whitespace-pre-wrap">{f.content}</p>
                          </div>
                        ))}
                        {!state.runtimeFeed.some((f) => f.content) && (
                          <p className="text-muted-foreground text-xs">Transcript unavailable.</p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="caveats">
                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-semibold text-yellow-500">Sources & Caveats</span>
                      </div>
                      <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap mb-3">
                        {state.caveats}
                      </div>
                      <p className="text-xs text-muted-foreground/60 border-t border-yellow-500/10 pt-3">
                        <strong className="text-yellow-500/80">Disclaimer: </strong>
                        Litigant AI provides AI-generated reasoning and decision support. Not legal, medical, financial, or professional advice.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── TEMPLATE SHEET — bottom drawer ── */}
      <Sheet open={templateSheetOpen} onOpenChange={(o) => !o && setTemplateSheetOpen(false)}>
        <SheetContent side="bottom" className="h-[65vh] flex flex-col bg-[#0a160a] border-t border-white/8">
          <SheetHeader className="shrink-0 pb-3 border-b border-white/5">
            <SheetTitle className="text-sm flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-primary" />
              Templates
            </SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-2 py-2 overflow-x-auto shrink-0 scrollbar-none">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-full border transition-colors shrink-0",
                activeCategory === "all"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-full border transition-colors shrink-0",
                  activeCategory === cat.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-white/10 text-muted-foreground hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onClick={() => {
                    setTemplate(template);
                    setConfig(template.defaultConfig);
                    setTemplateSheetOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
