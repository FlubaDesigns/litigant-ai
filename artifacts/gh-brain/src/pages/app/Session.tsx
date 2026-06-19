import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical, Settings2, Play, Square,
  ThumbsUp, ThumbsDown, AlertTriangle, Copy, Download,
  Zap, Target, RotateCcw, CheckCircle2, Sparkles, MessageSquare, X,
  Printer, Package, ShoppingCart, Cpu, LayoutTemplate, Shuffle,
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
import { saveUserConfig } from "@/services/firestoreService";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useLocation } from "wouter";
import {
  getProviders, PROVIDER_LABELS, PROVIDER_ICONS, estimateCredits,
  type ProviderInfo, type ModelInfo, type ModelCreditInfo,
} from "@/services/providerService";
import { Input } from "@/components/ui/input";
import { CourtDiagram } from "@/components/CourtDiagram";
import { SeatInspector } from "@/components/SeatInspector";
import { makeDefaultSeatMap } from "@/data/seatTypes";
import type { SeatAssignment } from "@/data/seatTypes";

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

// ── V29 field wrapper ─────────────────────────────────────────────────────────
function V29Field({
  label, desc, children,
}: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">{label}</div>
      {children}
      {desc && <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{desc}</p>}
    </div>
  );
}

const V29_SELECT = "bg-[#0d1a0d] border border-primary/30 text-sm text-foreground hover:border-primary/60 focus:border-primary h-10";

// ── ConfigPanel ───────────────────────────────────────────────────────────────
function ConfigPanel({
  open, onClose, config, onChange, uid, onboardingComplete,
}: {
  open: boolean;
  onClose: () => void;
  config: CourtConfig;
  onChange: (c: Partial<CourtConfig>) => void;
  uid?: string;
  onboardingComplete?: boolean;
}) {
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const [saving, setSaving] = useState(false);

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

  const credBase = selectedModel?.creditInfo
    ? estimateCredits(selectedModel.creditInfo, config.litigantCount, config.maxIterations, config.responseMode)
    : config.litigantCount * config.maxIterations * 3 + 6;
  const credLow = credBase;
  const credHigh = credBase + (config.conscience ? 1 : 0) + Math.ceil(credBase * 0.4);

  const confidenceLabel = {
    80: "80% Fast", 90: "90% Standard", 95: "95% Deep", 99: "99% Maximum",
  }[config.confidenceTarget as 80 | 90 | 95 | 99] ?? `${config.confidenceTarget}%`;

  async function handleSave() {
    onClose();
    if (!uid || !onboardingComplete) return;
    setSaving(true);
    try {
      await saveUserConfig(uid, {
        conscience: config.conscience,
        outputScope: config.outputScope,
        debateMode: config.debateMode,
        aiReasoning: config.aiReasoning,
        outputStrategy: config.outputStrategy,
        outputPreference: config.outputPreference,
        format: config.format,
        confidenceTarget: config.confidenceTarget,
        maxIterations: config.maxIterations,
        maxCredits: config.maxCredits,
        litigantCount: config.litigantCount,
        courtMode: config.courtMode,
        responseMode: config.responseMode,
        outputFormat: config.outputFormat,
        provider: config.provider,
        model: config.model,
      });
      toast.success("Configuration saved");
    } catch {
      toast.error("Could not save configuration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-sm bg-[#060e06] border-l-2 border-primary/40 overflow-y-auto p-0"
      >
        <div className="px-5 py-5 space-y-5">
          {/* Header */}
          <SheetHeader className="pb-0">
            <SheetTitle className="text-xl font-bold text-primary tracking-tight">
              Mission Briefing
            </SheetTitle>
          </SheetHeader>

          {/* SAFETY FILTER */}
          <V29Field label="Safety Filter" desc="ON: self-checks for bias, harm, and gaps. OFF: raw output.">
            <Select value={config.conscience ? "on" : "off"} onValueChange={(v) => onChange({ conscience: v === "on" })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="on">Conscience ON</SelectItem>
                <SelectItem value="off">Conscience OFF</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* RESPONSE MODE */}
          <V29Field label="Response Mode" desc="Consensus Only: one clean answer. All Voices: each AI's response shown.">
            <Select value={config.outputScope} onValueChange={(v) => onChange({ outputScope: v as CourtConfig["outputScope"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consensus">Consensus Only</SelectItem>
                <SelectItem value="all-voices">All Voices</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* DEBATE MODE */}
          <V29Field label="Debate Mode" desc="Adversarial: AIs challenge each other. Collaborative: AIs build on each other.">
            <Select value={config.debateMode} onValueChange={(v) => onChange({ debateMode: v as CourtConfig["debateMode"], courtMode: v === "adversarial" ? "adversarial" : "analysis" })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="adversarial">Adversarial</SelectItem>
                <SelectItem value="collaborative">Collaborative</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* AI REASONING */}
          <V29Field label="AI Reasoning" desc="Independent: each AI thinks alone. Chain: each reads prior responses first.">
            <Select value={config.aiReasoning} onValueChange={(v) => onChange({ aiReasoning: v as CourtConfig["aiReasoning"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="independent">Independent</SelectItem>
                <SelectItem value="chain">Chain</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* OUTPUT STRATEGY */}
          <V29Field label="Output Strategy">
            <Select value={config.outputStrategy} onValueChange={(v) => onChange({ outputStrategy: v as CourtConfig["outputStrategy"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="moderator-consensus">Moderator Consensus</SelectItem>
                <SelectItem value="individual">Individual Responses</SelectItem>
                <SelectItem value="consensus+individual">Consensus + Individual</SelectItem>
                <SelectItem value="transcript">Court Transcript</SelectItem>
                <SelectItem value="artifact">Artifact Only</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* OUTPUT PREFERENCE */}
          <V29Field label="Output Preference">
            <Select value={config.outputPreference} onValueChange={(v) => onChange({ outputPreference: v as CourtConfig["outputPreference"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Display in chat</SelectItem>
                <SelectItem value="download">Download only</SelectItem>
                <SelectItem value="both">Display + download</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* FORMAT */}
          <V29Field label="Format">
            <Select value={config.format} onValueChange={(v) => onChange({ format: v as CourtConfig["format"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* CONFIDENCE TARGET */}
          <V29Field label="Confidence Target">
            <Select value={String(config.confidenceTarget)} onValueChange={(v) => onChange({ confidenceTarget: Number(v) })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="80">80% Fast</SelectItem>
                <SelectItem value="90">90% Standard</SelectItem>
                <SelectItem value="95">95% Deep</SelectItem>
                <SelectItem value="99">99% Maximum</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* MAXIMUM ITERATIONS */}
          <V29Field label="Maximum Iterations">
            <Select value={String(config.maxIterations)} onValueChange={(v) => onChange({ maxIterations: Number(v) })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* MAXIMUM CREDITS */}
          <V29Field label="Maximum Credits">
            <Select value={String(config.maxCredits)} onValueChange={(v) => onChange({ maxCredits: Number(v) })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* AI PROVIDER */}
          {availableProviders.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-primary/10">
              <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">AI Provider</div>
              <div className="grid grid-cols-2 gap-1.5">
                {availableProviders.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => onChange({ provider: p.name as ProviderName, model: p.defaultModel })}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all",
                      config.provider === p.name || (!config.provider && p === availableProviders[0])
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 bg-transparent text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <span>{PROVIDER_ICONS[p.name as ProviderName]}</span>
                    {PROVIDER_LABELS[p.name as ProviderName]}
                  </button>
                ))}
              </div>
              {selectedProvider && selectedProvider.models.length > 0 && (
                <Select value={config.model ?? selectedProvider.defaultModel} onValueChange={(v) => onChange({ model: v })}>
                  <SelectTrigger className={V29_SELECT + " text-xs h-8"}><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>
                    {selectedProvider.models.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* ESTIMATED RUN COST */}
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-1">
            <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">Estimated Run Cost</div>
            <div className="text-2xl font-bold text-primary">{credLow}–{credHigh} Credits</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Based on {config.litigantCount} litigants, {config.debateMode} mode,{" "}
              {confidenceLabel}{config.conscience ? " + conscience gate (+1 Cr)" : ""}.
            </div>
          </div>

          {/* BUTTONS */}
          <div className="flex gap-2 pb-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-white text-black hover:bg-white/90 font-semibold"
            >
              {saving ? "Saving…" : "Save Configuration"}
            </Button>
            <Button onClick={onClose} variant="outline" className="flex-1 border-primary/30 text-foreground">
              Close
            </Button>
          </div>
          {!onboardingComplete && uid && (
            <p className="text-[11px] text-muted-foreground/60 text-center -mt-2">
              Complete onboarding to save as default
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── RuntimeControl ────────────────────────────────────────────────────────────
const COURT_MODE_LABELS: Record<string, string> = {
  adversarial: "Adversarial",
  socratic: "Socratic",
  analysis: "Analysis",
  critique: "Critique",
};

function RuntimeControl({
  starting, current, used, round, maxRound, cap, mode,
}: {
  starting: number; current: number; used: number;
  round: number; maxRound: number; cap: number; mode: string;
}) {
  const cells = [
    { label: "STARTING", value: String(starting), color: "text-white" },
    { label: "CURRENT",  value: String(current),  color: current < 10 ? "text-red-400" : current < 30 ? "text-yellow-400" : "text-primary" },
    { label: "USED",     value: String(used),      color: "text-white" },
    { label: "ROUND",    value: `${round} / ${maxRound}`, color: "text-white" },
    { label: "CREDIT CAP", value: cap > 0 ? `~${cap}` : "—", color: "text-muted-foreground" },
    { label: "MODE",     value: COURT_MODE_LABELS[mode] ?? mode, color: "text-primary/80" },
  ];
  return (
    <div className="rounded-lg border border-primary/20 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-primary/10 bg-primary/5">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Runtime Control</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-primary/10">
        {cells.map(({ label, value, color }) => (
          <div key={label} className="bg-[#070f07] px-3 py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">{label}</div>
            <div className={cn("text-[15px] font-bold font-mono leading-none", color)}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── V29 Conversation helpers ──────────────────────────────────────────────────

const PROVIDER_SHORT: Record<string, string> = {
  anthropic: "Claude", openai: "GPT", grok: "Grok", gemini: "Gemini",
};

function isLitigantRole(role: string) {
  return role.toLowerCase().startsWith("litigant");
}
function isOrchestratorRole(role: string) {
  return role === "Orchestrator" || role === "Verdict" || role === "Moderator";
}

// A single dialog line — matches V29 .dialog-line exactly
function DialogLine({ item, adversarial }: { item: FeedItem; adversarial?: boolean }) {
  const isYou = item.role === "You";
  const isLit = isLitigantRole(item.role);

  // Determine colors
  let borderColor: string;
  let speakerColor: string;
  let bgStyle: React.CSSProperties;

  if (isYou) {
    borderColor = "#4a9eff";
    speakerColor = "#4a9eff";
    bgStyle = { background: "rgba(0,120,255,.08)" };
  } else if (isLit) {
    borderColor = adversarial ? "#c84040" : "#7ab87a";
    speakerColor = adversarial ? "#ff9a9a" : "#7ab87a";
    bgStyle = { background: "rgba(0,0,0,.12)" };
  } else {
    // Orchestrator / Moderator / Verdict
    borderColor = "#7ab87a";
    speakerColor = "#7ab87a";
    bgStyle = { background: "rgba(0,0,0,.15)" };
  }

  // Extract disclosure header from "[Seat | Model | …]\n" pattern
  let disclosure = "";
  let body = item.content;
  if (!isYou && !isLit && body.startsWith("[")) {
    const nl = body.indexOf("\n");
    if (nl > -1) { disclosure = body.slice(0, nl + 1); body = body.slice(nl + 1); }
  }

  const providerShort = item.provider ? (PROVIDER_SHORT[item.provider] ?? null) : null;
  const speakerLabel = `${item.role}${isLit && adversarial ? " ⚔" : ""}${providerShort ? ` · ${providerShort}` : ""}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      style={{ ...bgStyle, borderLeft: `3px solid ${borderColor}`, borderRadius: 8, marginBottom: 8, padding: "6px 8px", lineHeight: 1.5, fontSize: 14 }}
    >
      <span style={{ fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 2, color: speakerColor }}>
        {speakerLabel}
        {item.round > 0 && item.round < 99 && (
          <span style={{ fontWeight: 400, color: "#4a6a4a", marginLeft: 6, fontSize: 10 }}>R{item.round}</span>
        )}
        {!item.isComplete && (
          <span style={{ marginLeft: 6, display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
            {[0, 130, 260].map((d) => (
              <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce inline-block" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
      </span>
      {disclosure && (
        <span style={{ fontSize: 11, color: "#3a5a3a", fontStyle: "italic", display: "block", marginBottom: 4, lineHeight: 1.3 }}>
          {disclosure.trim()}
        </span>
      )}
      {body || (!item.isComplete ? "" : <span style={{ color: "#4a6a4a", fontStyle: "italic" }}>No content.</span>)}
    </motion.div>
  );
}

// Litigant Voices box — collapsible, shown only in All Voices mode
function LitigantVoicesBox({
  items, adversarial, scrollRef,
}: { items: FeedItem[]; adversarial: boolean; scrollRef?: React.RefObject<HTMLDivElement> }) {
  const [open, setOpen] = useState(true);

  function handleSave() {
    const lines = items.filter(f => f.content).map(f =>
      `${f.role.toUpperCase()}\n${f.content}\n`
    ).join("\n---\n\n");
    if (!lines) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["Litigant Voices Export\n\n" + lines], { type: "text/plain" }));
    a.download = `LitigantVoices_${Date.now()}.txt`;
    a.click();
  }

  return (
    <div style={{ border: "1px solid #7ab87a", borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "rgba(122,184,122,.07)", borderBottom: "1px solid #1d331d", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontSize: 11, color: "#7ab87a", letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 800, whiteSpace: "nowrap" }}>Litigant Voices</span>
          {adversarial && (
            <span style={{ fontSize: 9, fontWeight: 900, color: "#ff6b6b", border: "1px solid #c84040", borderRadius: 999, padding: "1px 6px", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>⚔ ADV</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          <button onClick={handleSave} title="Export" style={{ fontSize: 12, padding: "3px 7px", minHeight: 26, background: "transparent", border: "1px solid #7ab87a", borderRadius: 6, cursor: "pointer", color: "#eef7ee" }}>⬇</button>
          <button onClick={() => setOpen(v => !v)} style={{ fontSize: 11, padding: "3px 8px", minHeight: 26, background: "transparent", border: "1px solid #7ab87a", borderRadius: 6, color: "#7ab87a", cursor: "pointer", whiteSpace: "nowrap" }}>
            {open ? "▼" : "▶"}
          </button>
        </div>
      </div>
      {/* Body */}
      {open && (
        <div ref={scrollRef} style={{ minHeight: 80, maxHeight: "clamp(120px,22vh,280px)", overflowY: "auto", padding: 10, background: "rgba(0,0,0,.12)" }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: "#3a5a3a", fontStyle: "italic" }}>Waiting for litigant debate…</div>
          ) : (
            items.map(item => <DialogLine key={item.id} item={item} adversarial={adversarial} />)
          )}
        </div>
      )}
    </div>
  );
}

// Orchestrator / Consensus box — always open
function OrchestratorBox({
  question, items, scrollRef,
}: { question: string; items: FeedItem[]; scrollRef?: React.RefObject<HTMLDivElement> }) {
  function handleSave() {
    const youLine = `YOU\n${question}\n`;
    const lines = items.filter(f => f.content).map(f =>
      `${f.role.toUpperCase()}\n${f.content}\n`
    ).join("\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["Litigant AI — Conversation Export\n\n" + youLine + "\n---\n\n" + lines], { type: "text/plain" }));
    a.download = `LitigantAI_${Date.now()}.txt`;
    a.click();
  }

  function handlePrint() { window.print(); }

  const youItem: FeedItem = { id: "you", role: "You", provider: "", content: question, round: 0, timestamp: 0, isComplete: true };

  return (
    <div style={{ border: "1px solid #00c853", borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "rgba(0,200,83,.07)", borderBottom: "1px solid #1d331d", gap: 6 }}>
        <span style={{ fontSize: 11, color: "#00c853", letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 800, whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>Orchestrator / Consensus</span>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={handleSave} title="Save" style={{ fontSize: 12, padding: "3px 7px", minHeight: 26, background: "transparent", border: "1px solid #00c853", borderRadius: 6, cursor: "pointer", color: "#eef7ee" }}>⬇</button>
          <button onClick={handlePrint} title="Print" style={{ fontSize: 12, padding: "3px 7px", minHeight: 26, background: "transparent", border: "1px solid #00c853", borderRadius: 6, cursor: "pointer", color: "#eef7ee" }}>🖨</button>
        </div>
      </div>
      {/* Body */}
      <div ref={scrollRef} style={{ minHeight: 80, maxHeight: "clamp(160px,32vh,360px)", overflowY: "auto", padding: "10px 10px 6px", fontSize: 14, lineHeight: 1.6, background: "rgba(0,0,0,.12)" }}>
        {question && <DialogLine key="you" item={youItem} />}
        {items.map(item => <DialogLine key={item.id} item={item} />)}
        {items.length === 0 && question && (
          <div style={{ fontSize: 12, color: "#3a5a3a", fontStyle: "italic", marginTop: 6 }}>Courtroom assembling…</div>
        )}
      </div>
    </div>
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
        // Core settings
        courtMode:        (userProfile.defaultSettings.courtMode as CourtConfig["courtMode"]) ?? "adversarial",
        litigantCount:    userProfile.defaultSettings.litigantCount ?? 3,
        confidenceTarget: userProfile.defaultSettings.confidenceTarget ?? 80,
        maxIterations:    userProfile.defaultSettings.maxIterations ?? 2,
        responseMode:     (userProfile.defaultSettings.responseMode as CourtConfig["responseMode"]) ?? "balanced",
        outputFormat:     (userProfile.defaultSettings.outputFormat as CourtConfig["outputFormat"]) ?? "report",
        provider:         (userProfile.defaultSettings.provider as CourtConfig["provider"]) ?? undefined,
        model:            userProfile.defaultSettings.model ?? undefined,
        // V29 Mission Briefing fields
        conscience:       userProfile.defaultSettings.conscience ?? true,
        aiReasoning:      (userProfile.defaultSettings.aiReasoning as CourtConfig["aiReasoning"]) ?? "chain",
        debateMode:       (userProfile.defaultSettings.debateMode as CourtConfig["debateMode"]) ?? "adversarial",
        maxCredits:       userProfile.defaultSettings.maxCredits ?? undefined,
        outputScope:      (userProfile.defaultSettings.outputScope as CourtConfig["outputScope"]) ?? undefined,
        outputStrategy:   (userProfile.defaultSettings.outputStrategy as CourtConfig["outputStrategy"]) ?? undefined,
        outputPreference: (userProfile.defaultSettings.outputPreference as CourtConfig["outputPreference"]) ?? undefined,
        format:           (userProfile.defaultSettings.format as CourtConfig["format"]) ?? undefined,
      }
    : undefined;
  const { state, run, stop, reset, acceptPartial, continueSession, setQuestion, setTemplate, setConfig, setSeatAI, applyFeedbackGrades } = useBrainSession(savedConfig);
  const [, navigate] = useLocation();

  const [configOpen, setConfigOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [feedbackGiven, setFeedbackGiven] = useState<"good" | "bad" | "warn" | null>(null);
  const [inspectorSeat, setInspectorSeat] = useState<{ seatId: string; litIndex?: number } | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [selectedCreditInfo, setSelectedCreditInfo] = useState<ModelCreditInfo | null>(null);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const activityLogRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll activity log
  useEffect(() => {
    if (activityLogRef.current && activityLogOpen) {
      activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
    }
  }, [state.activityLog, activityLogOpen]);

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
    if (rating === "good" || rating === "bad") {
      applyFeedbackGrades(rating, state.courtHappened ? "answer" : "answer");
    }
    try {
      await submitFeedback({
        userId: user?.uid ?? null,
        sessionId: state.sessionId,
        turnId: state.sessionId ?? `anon-${Date.now()}`,
        role: "Verdict",
        rating,
      });
      toast.success("Feedback recorded — grades updated.");
    } catch {
      toast.error("Failed to save feedback.");
    }
  }

  function handleSeatClick(seatId: string, litIndex?: number) {
    setInspectorSeat({ seatId, litIndex });
  }

  function handleSeatUpdate(seatId: string, assignment: SeatAssignment, litIndex?: number) {
    setSeatAI(seatId, assignment, litIndex);
  }

  function handleAddLitigant() {
    const next = Math.min(state.config.litigantCount + 1, 8);
    setConfig({ litigantCount: next });
  }

  function handleRemoveLitigant() {
    const next = Math.max(state.config.litigantCount - 1, 2);
    setConfig({ litigantCount: next });
  }

  const isRunning = state.phase === "running";
  const isPaused = state.phase === "paused";
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
      <ConfigPanel
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        config={state.config}
        onChange={setConfig}
        uid={user?.uid}
        onboardingComplete={userProfile?.onboardingComplete}
      />

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
      <div className="shrink-0 relative h-[160px] sm:h-[clamp(240px,44vh,500px)]">
        <CourtDiagram
          activeRole={state.activeRole}
          litigantCount={state.config.litigantCount}
          running={isRunning}
          confidence={state.confidence}
          creditsUsed={state.creditsUsed}
          estimatedCredits={state.estimatedCredits}
          complete={isComplete}
          seatMap={state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount)}
          grades={state.grades}
          onSeatClick={handleSeatClick}
          onAddLitigant={!isRunning ? handleAddLitigant : undefined}
          onRemoveLitigant={!isRunning ? handleRemoveLitigant : undefined}
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

        {/* RUNNING — Runtime Control + Activity Log + content feed */}
        {isRunning && (
          <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {/* Runtime Control — live 6-metric stats grid */}
            <RuntimeControl
              starting={credits + state.creditsUsed}
              current={credits}
              used={state.creditsUsed}
              round={state.currentRound}
              maxRound={state.config.maxIterations}
              cap={state.estimatedCredits}
              mode={state.config.courtMode}
            />

            {/* Activity Log — collapsible status stream */}
            <div className="rounded-lg border border-primary/20 overflow-hidden">
              <button
                onClick={() => setActivityLogOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="text-primary font-bold tracking-wide">Activity Log</span>
                  {isRunning && (
                    <span className="flex gap-0.5">
                      {[0, 120, 240].map((d) => (
                        <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                  )}
                </span>
                <span className="text-primary/50">{activityLogOpen ? "▼" : "▶"}</span>
              </button>
              {activityLogOpen && (
                <div
                  ref={activityLogRef}
                  className="px-3 py-2 max-h-44 overflow-y-auto space-y-0.5"
                  style={{ background: "rgba(0,0,0,0.35)" }}
                >
                  {state.activityLog.map((entry, i) => {
                    const isCourtroom = entry.startsWith("[Courtroom]");
                    const isOrch = entry.startsWith("[Orchestrator]");
                    const isMod = entry.startsWith("[Moderator]");
                    const isSystem = entry.startsWith("[System]");
                    const color = isCourtroom ? "text-primary/70"
                      : isOrch ? "text-yellow-400/90"
                      : isMod ? "text-cyan-400/90"
                      : isSystem ? "text-muted-foreground/60"
                      : "text-primary";
                    return (
                      <div key={i} className={cn("text-[11px] font-mono leading-relaxed", color)}>
                        {entry}
                      </div>
                    );
                  })}
                  {state.activityLog.length === 0 && (
                    <div className="text-[11px] font-mono text-muted-foreground/40">Waiting…</div>
                  )}
                </div>
              )}
            </div>

            {/* V29 two-box conversation */}
            {state.question && (
              <div className="space-y-2">
                {/* Litigant Voices — shown only when there are litigant turns */}
                {state.runtimeFeed.some((f) => isLitigantRole(f.role)) && (
                  <LitigantVoicesBox
                    items={state.runtimeFeed.filter((f) => isLitigantRole(f.role))}
                    adversarial={state.config.courtMode === "adversarial"}
                  />
                )}
                {/* Orchestrator / Consensus box */}
                <OrchestratorBox
                  question={state.question}
                  items={state.runtimeFeed.filter((f) => isOrchestratorRole(f.role))}
                />
              </div>
            )}
          </div>
        )}

        {/* COMPLETE / PAUSED / ERROR — results */}
        {(isComplete || isPaused || isError) && (
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
                {/* ── Pause decision card (credit cap / iteration limit) ── */}
                {isPaused && state.pauseReason && (
                  <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-4 mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">⏸</span>
                      <span className="font-bold text-[13px] text-orange-300">
                        {state.pauseReason === "credit_cap"
                          ? `Credit cap reached — at ${Math.round(state.confidence)}% confidence`
                          : `${state.config.maxIterations} round${state.config.maxIterations !== 1 ? "s" : ""} complete — at ${Math.round(state.confidence)}% (target ${state.config.confidenceTarget}%)`}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mb-3">
                      {state.pauseReason === "credit_cap"
                        ? "You've used your credit cap. Want to keep going?"
                        : "Ran out of debate rounds before hitting your confidence target. Want more?"}
                    </p>

                    {/* Confidence bar */}
                    <div className="space-y-1.5 mb-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground/60">
                        <span>Confidence</span>
                        <span className="font-mono text-orange-300">{Math.round(state.confidence)}% / {state.config.confidenceTarget}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div className="h-full rounded-full bg-orange-400 transition-all"
                          style={{ width: `${Math.min(100, (state.confidence / state.config.confidenceTarget) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground/60">
                        <span>Credits used</span>
                        <span className="font-mono">{state.creditsUsed} · <span className={credits === 0 ? "text-red-400" : "text-primary"}>{credits} remaining</span></span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {credits === 0 ? (
                        <button
                          onClick={() => navigate("/billing")}
                          className="flex-1 py-2 rounded-lg bg-primary text-black text-xs font-bold text-center hover:bg-primary/90 transition-colors"
                        >
                          Top Up Wallet
                        </button>
                      ) : (
                        <button
                          onClick={() => { void continueSession(); }}
                          className="flex-1 py-2 rounded-lg bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors"
                        >
                          Continue — {credits} credits available
                        </button>
                      )}
                      <button
                        onClick={acceptPartial}
                        className="flex-1 py-2 rounded-lg border border-white/15 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
                      >
                        Accept this answer
                      </button>
                    </div>
                  </div>
                )}

                {/* ── V29 Completion banner (only when fully complete, not paused) ── */}
                {!isPaused && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 mb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🛑</span>
                    <span className="font-bold text-[13px] text-yellow-300">
                      Stopped — {state.currentRound} round{state.currentRound !== 1 ? "s" : ""} reached at{" "}
                      {Math.round(state.confidence)}% confidence
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground/70 mb-1">
                        <span>Confidence</span>
                        <span className="font-mono text-primary">
                          {Math.round(state.confidence)}% / {state.config.confidenceTarget}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, (state.confidence / state.config.confidenceTarget) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground/70 mb-1">
                        <span>Credits Used</span>
                        <span className="font-mono text-primary">{state.creditsUsed} credits</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, (state.creditsUsed / Math.max(state.estimatedCredits, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Activity Log history — collapsed by default after completion */}
                {state.activityLog.length > 0 && (
                  <div className="rounded-lg border border-primary/15 overflow-hidden mb-3">
                    <button
                      onClick={() => setActivityLogOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono bg-primary/5 hover:bg-primary/10 transition-colors"
                    >
                      <span className="text-primary/70 font-bold tracking-wide">Activity Log</span>
                      <span className="text-primary/40">{activityLogOpen ? "▼" : "▶"}</span>
                    </button>
                    {activityLogOpen && (
                      <div className="px-3 py-2 max-h-36 overflow-y-auto space-y-0.5" style={{ background: "rgba(0,0,0,0.25)" }}>
                        {state.activityLog.map((entry, i) => {
                          const isCourtroom = entry.startsWith("[Courtroom]");
                          const isOrch = entry.startsWith("[Orchestrator]");
                          const isMod = entry.startsWith("[Moderator]");
                          const isSystem = entry.startsWith("[System]");
                          const color = isCourtroom ? "text-primary/60"
                            : isOrch ? "text-yellow-400/70"
                            : isMod ? "text-cyan-400/70"
                            : isSystem ? "text-muted-foreground/50"
                            : "text-primary/80";
                          return (
                            <div key={i} className={cn("text-[11px] font-mono leading-relaxed", color)}>
                              {entry}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

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
                    <div className="space-y-2">
                      {state.runtimeFeed.some((f) => isLitigantRole(f.role)) && (
                        <LitigantVoicesBox
                          items={state.runtimeFeed.filter((f) => isLitigantRole(f.role))}
                          adversarial={state.config.courtMode === "adversarial"}
                        />
                      )}
                      <OrchestratorBox
                        question={state.question}
                        items={state.runtimeFeed.filter((f) => isOrchestratorRole(f.role))}
                      />
                      {!state.runtimeFeed.some((f) => f.content) && (
                        <p className="text-muted-foreground text-xs text-center py-6">Transcript unavailable.</p>
                      )}
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
      {/* ── SEAT INSPECTOR ── */}
      {inspectorSeat && (
        <SeatInspector
          seatId={inspectorSeat.seatId}
          litIndex={inspectorSeat.litIndex}
          litigantCount={state.config.litigantCount}
          seatMap={state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount)}
          grades={state.grades}
          onClose={() => setInspectorSeat(null)}
          onUpdate={(seatId, assignment, li) =>
            handleSeatUpdate(seatId, assignment, li)
          }
        />
      )}

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
