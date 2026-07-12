import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical, Settings2, Play, Square,
  ThumbsUp, ThumbsDown, AlertTriangle, Copy, Download,
  Zap, Target, RotateCcw, CheckCircle2, Sparkles, MessageSquare, X,
  Printer, Package, ShoppingCart, Cpu, LayoutTemplate, Shuffle,
  ChevronRight, Gavel, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useLimits } from "@/hooks/useLimits";
import { Input } from "@/components/ui/input";
import { CourtDiagram } from "@/components/CourtDiagram";
import { SeatInspector } from "@/components/SeatInspector";
import { makeDefaultSeatMap, SEAT_PURPOSES, getSeatAIShortName } from "@/data/seatTypes";
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
  label, desc, tooltip, children,
}: { label: string; desc?: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">{label}</div>
        {tooltip && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                className="text-primary/40 hover:text-primary/80 transition-colors"
                aria-label={`More info about ${label}`}
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-[280px] text-[11px] leading-relaxed">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
      {desc && <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{desc}</p>}
    </div>
  );
}

const V29_SELECT = "bg-[#0d1a0d] border border-primary/30 text-sm text-foreground hover:border-primary/60 focus:border-primary h-10";

// ── ConfigPanel ───────────────────────────────────────────────────────────────
function ConfigPanel({
  open, onClose, config, onChange, uid, onboardingComplete, isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  config: CourtConfig;
  onChange: (c: Partial<CourtConfig>) => void;
  uid?: string;
  onboardingComplete?: boolean;
  isAdmin?: boolean;
}) {
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const hasChanges = useRef(false);

  useEffect(() => {
    if (open) {
      hasChanges.current = false;
      getProviders().then((p) => setAvailableProviders(p.providers));
    }
  }, [open]);

  // Wrap onChange to track that the user made at least one change
  function handleChange(partial: Partial<CourtConfig>) {
    hasChanges.current = true;
    onChange(partial);
  }

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

  // Auto-saves whenever the panel closes if the user made any change
  async function handleClose() {
    if (hasChanges.current && uid && onboardingComplete) {
      hasChanges.current = false;
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
          artifactType: config.artifactType,
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
        toast.success("Court configured & saved to your profile");
      } catch {
        toast.error("Could not save configuration");
      } finally {
        setSaving(false);
      }
    }
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-sm bg-[#060e06] border-l-2 border-primary/40 overflow-y-auto p-0"
      >
        <TooltipProvider delayDuration={150}>
        <div className="px-5 py-5 space-y-5">
          {/* Header */}
          <SheetHeader className="pb-0">
            <SheetTitle className="text-xl font-bold text-primary tracking-tight">
              Mission Briefing
            </SheetTitle>
          </SheetHeader>

          {/* SAFETY FILTER */}
          <V29Field
            label="Conscience"
            desc="ON: self-checks for bias, harm, and gaps. OFF: raw output."
            tooltip="Conscience is a governing mandate — a fixed block of instructions appended directly to every seat's system prompt, not a separate filter that reviews output afterward. Its current version (Canon v2, Execution-Honest) tells every AI, before it writes a single word: state what the evidence actually shows even if uncomfortable; never assert something it can't substantiate, and admit it doesn't know when that's true; never give a diplomatic non-answer to dodge conflict; explicitly name what information is missing; and report honestly if its own reasoning led somewhere unexpected, rather than reverse-engineering an argument to fit a conclusion. So it shapes how each seat reasons from the first token, not just what gets shown after. It costs a small credit surcharge (+1 Cr) because it adds to every prompt. When OFF, seats get no such mandate and respond however the base model naturally would — which can be more evasive, hedged, or unwilling to state hard conclusions plainly. An admin can update the exact wording of this mandate at any time without a code deploy."
          >
            <Select value={config.conscience ? "on" : "off"} onValueChange={(v) => handleChange({ conscience: v === "on" })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="on">Conscience ON</SelectItem>
                <SelectItem value="off">Conscience OFF</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* RESPONSE MODE */}
          <V29Field
            label="Response Mode"
            desc="Consensus Only: one clean answer. All Voices: each AI's response shown."
            tooltip="Controls how much of the debate you actually see. Consensus Only hides the individual seats and shows just the final synthesized answer — cleanest for quick decisions. All Voices shows every seat's full response alongside the synthesis, so you can see exactly how each AI reasoned and where they agreed or disagreed."
          >
            <Select value={config.outputScope} onValueChange={(v) => handleChange({ outputScope: v as CourtConfig["outputScope"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consensus">Consensus Only</SelectItem>
                <SelectItem value="all-voices">All Voices</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* DEBATE MODE */}
          <V29Field
            label="Debate Mode"
            desc="Adversarial: AIs challenge each other. Collaborative: AIs build on each other."
            tooltip="Sets how the seats treat each other's arguments, independent of which court mode is active. Adversarial: each seat actively challenges others, hunts for contradictions, and attacks weak reasoning — good for pressure-testing an idea. Collaborative: seats build on each other's points and work toward synthesis rather than confrontation — good for exploring or refining an idea together."
          >
            <Select value={config.debateMode} onValueChange={(v) => handleChange({ debateMode: v as CourtConfig["debateMode"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="adversarial">Adversarial</SelectItem>
                <SelectItem value="collaborative">Collaborative</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* AI REASONING */}
          <V29Field
            label="AI Reasoning"
            tooltip="Controls whether seats hear each other. Independent: each AI only sees its own prior turns, never the other seats' responses — faster and cheaper, good for gathering distinct unbiased takes. Chain: each AI reads the entire transcript so far before responding, enabling real cross-examination and rebuttal — richer, but costs significantly more credits since every seat re-reads a growing transcript every round."
          >
            <div className="flex flex-col gap-1.5">
              {(["independent", "chain"] as const).map((mode) => {
                const isSelected = config.aiReasoning === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleChange({ aiReasoning: mode })}
                    className={cn(
                      "text-left px-3 py-2.5 rounded border text-xs transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <div className="font-semibold capitalize mb-0.5">{mode}</div>
                    {mode === "independent" ? (
                      <div className="text-[11px] leading-snug opacity-80">
                        Each AI builds on its own prior arguments only — other seats are not heard. Lower credit cost.
                      </div>
                    ) : (
                      <div className="text-[11px] leading-snug opacity-80">
                        Each AI reads the full debate before responding. Richer cross-examination —{" "}
                        <span className={isSelected ? "text-yellow-400" : "text-yellow-500"}>uses significantly more credits</span>{" "}
                        because all agents re-read the entire transcript each turn.
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </V29Field>

          {/* OUTPUT STRATEGY */}
          <V29Field
            label="Output Strategy"
            tooltip="Determines what gets built from the debate. Moderator Consensus: a moderator seat reads all arguments and writes one synthesized answer. Individual Responses: shows each AI's answer separately with no synthesis. Consensus + Individual: shows both the synthesis and every individual response. Court Transcript: the full raw turn-by-turn debate log. Artifact Only: skips narrative output entirely and produces just the generated artifact (doc, code, etc.) set by Artifact Type."
          >
            <Select value={config.outputStrategy} onValueChange={(v) => handleChange({ outputStrategy: v as CourtConfig["outputStrategy"] })}>
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
          <V29Field
            label="Output Preference"
            tooltip="Controls where the final result ends up. Display in chat: read the result directly in the session, nothing downloaded automatically. Download only: skips the on-screen display and gives you a file to save. Display + download: shows the result in chat and also makes it available as a downloadable file."
          >
            <Select value={config.outputPreference} onValueChange={(v) => handleChange({ outputPreference: v as CourtConfig["outputPreference"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Display in chat</SelectItem>
                <SelectItem value="download">Download only</SelectItem>
                <SelectItem value="both">Display + download</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* FORMAT */}
          <V29Field
            label="Format"
            tooltip="The file format used when your output is downloaded or exported. Text: plain .txt, no formatting. Markdown: headings, bullets, and emphasis preserved (.md) — best for reading or pasting into docs. JSON: structured data (.json) — best if you're feeding the result into another tool or script."
          >
            <Select value={config.format} onValueChange={(v) => handleChange({ format: v as CourtConfig["format"] })}>
              <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </V29Field>

          {/* ARTIFACT TYPE */}
          <V29Field
            label="Artifact Type"
            desc="What the Builder produces. Auto: Architect decides based on your question."
            tooltip="The concrete deliverable the Builder seat produces once the debate concludes. Auto lets the Architect seat infer the best format from your question. Choosing a specific type (report, memo, business plan, code, etc.) forces the Builder to always produce that structure regardless of how the debate goes."
          >
            <div className="grid grid-cols-1 gap-1.5">
              {([
                { value: "auto",          label: "Auto",            sub: "Architect decides from context",         group: "general" },
                { value: "report",        label: "Report",          sub: "Research summary or analysis",           group: "doc" },
                { value: "memo",          label: "Decision Memo",   sub: "Clear recommendation + rationale",       group: "doc" },
                { value: "business-plan", label: "Business Plan",   sub: "Full venture plan",                     group: "doc" },
                { value: "risk-matrix",   label: "Risk Matrix",     sub: "Structured risk assessment",            group: "doc" },
                { value: "contract-review", label: "Contract Review", sub: "Risks, red flags, negotiation points", group: "doc" },
                { value: "technical-spec", label: "Technical Spec", sub: "Architecture or build specification",   group: "doc" },
                { value: "pitch-deck",    label: "Pitch Deck",      sub: "Slide-by-slide narrative outline",      group: "doc" },
                { value: "legal-brief",   label: "Legal Brief",     sub: "Argument structure + supporting points", group: "doc" },
                { value: "blog-post",     label: "Blog Post",       sub: "Long-form article or editorial",        group: "doc" },
                { value: "code",          label: "Code",            sub: "Runnable code — function, script, module", group: "code" },
                { value: "landing-page",  label: "Landing Page",    sub: isAdmin ? "HTML/React page — Git integration in v2" : "Generate a full HTML or React page", group: "code" },
              ] as { value: string; label: string; sub: string; group: string }[]).map(({ value, label, sub, group }) => {
                const isSelected = (config.artifactType ?? "auto") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleChange({ artifactType: value as CourtConfig["artifactType"] })}
                    className={cn(
                      "text-left px-3 py-2 rounded border text-xs transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{label}</span>
                      {group === "code" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-primary/30 text-primary/60 font-mono uppercase tracking-wider">
                          {value === "landing-page" ? "v2" : "code"}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] leading-snug opacity-70 mt-0.5">{sub}</div>
                  </button>
                );
              })}
            </div>
          </V29Field>

          {/* CONFIDENCE TARGET */}
          <V29Field
            label="Confidence Target"
            tooltip="How rigorous the debate needs to be before the court stops and delivers an answer. Fast (80%) accepts a quicker, less exhaustive pass. Standard (90%) is a balanced default. Deep (95%) and Maximum (99%) push seats to keep iterating and challenging until confidence is very high — higher targets take longer and use more credits since more rounds may run."
          >
            <Select value={String(config.confidenceTarget)} onValueChange={(v) => handleChange({ confidenceTarget: Number(v) })}>
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
          <V29Field
            label="Maximum Iterations"
            tooltip="The maximum number of debate rounds the court is allowed to run before it must stop and produce a result, even if the Confidence Target hasn't been reached yet. More iterations allow deeper back-and-forth but use more credits — this is a hard ceiling that caps runaway sessions."
          >
            <Select value={String(config.maxIterations)} onValueChange={(v) => handleChange({ maxIterations: Number(v) })}>
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
          <V29Field
            label="Maximum Credits"
            tooltip="A hard spending cap for this session. If a run is on track to exceed this many credits, it stops early rather than continuing to spend. This protects you from an unexpectedly expensive session — set it higher if you want the court to run as long as it needs, or lower to strictly control cost."
          >
            <Select value={String(config.maxCredits)} onValueChange={(v) => handleChange({ maxCredits: Number(v) })}>
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
              <div className="flex items-center gap-1.5">
                <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">AI Provider</div>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button type="button" tabIndex={-1} className="text-primary/40 hover:text-primary/80 transition-colors" aria-label="More info about AI Provider">
                      <HelpCircle className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" className="max-w-[280px] text-[11px] leading-relaxed">
                    Which underlying AI model powers every seat in this session. Different providers vary in reasoning style, speed, and cost per credit. Switching provider also lets you pick a specific model from that provider below.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {availableProviders.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handleChange({ provider: p.name as ProviderName, model: p.defaultModel })}
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
                <Select value={config.model ?? selectedProvider.defaultModel} onValueChange={(v) => handleChange({ model: v })}>
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
              Based on {Math.min(config.litigantCount, 4)} litigants{config.litigantCount > 4 ? ` of ${config.litigantCount} configured` : ""}, {config.debateMode} mode,{" "}
              {confidenceLabel}{config.conscience ? " + conscience gate (+1 Cr)" : ""}.
            </div>
          </div>

          {/* CLOSE — auto-saves if anything changed */}
          <div className="flex flex-col gap-2 pb-2">
            <Button
              onClick={handleClose}
              disabled={saving}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {saving ? "Saving…" : "Done"}
            </Button>
            {onboardingComplete
              ? <p className="text-[11px] text-muted-foreground/50 text-center">Changes save automatically when you close</p>
              : uid && <p className="text-[11px] text-muted-foreground/50 text-center">Complete onboarding to persist settings</p>
            }
          </div>
        </div>
        </TooltipProvider>
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

// Roles that are NOT litigants — defined by exclusion so any new persona
// added to brainEngine.ts is automatically treated as a litigant turn.
const NON_LITIGANT_ROLES = new Set(["Orchestrator", "Moderator", "Architect", "Builder", "Auditor", "Verdict"]);
function isLitigantRole(role: string) {
  return role !== "You" && !NON_LITIGANT_ROLES.has(role);
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
          <span className="dialog-round">R{item.round}</span>
        )}
        {!item.isComplete && (
          <span className="dialog-typing">
            {[0, 130, 260].map((d) => (
              <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce inline-block" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
      </span>
      {disclosure && (
        <span className="dialog-disclosure">
          {disclosure.trim()}
        </span>
      )}
      {body || (!item.isComplete ? "" : <span className="dialog-nocontent">No content.</span>)}
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
    <div className="sbox sbox--lit">
      {/* Header */}
      <div className="sbox-hd sbox-hd--lit">
        <div className="sbox-hd-left">
          <span className="sbox-label sbox-label--lit">Litigant Voices</span>
          {adversarial && <span className="adv-badge">⚔ ADV</span>}
        </div>
        <div className="sbox-hd-right">
          <button onClick={handleSave} title="Export" className="sbox-btn sbox-btn--lit">⬇</button>
          <button onClick={() => setOpen(v => !v)} className="sbox-btn sbox-btn--lit">
            {open ? "▼" : "▶"}
          </button>
        </div>
      </div>
      {/* Body */}
      {open && (
        <div ref={scrollRef} className="sbox-bd sbox-bd--lit">
          {items.length === 0 ? (
            <div className="sbox-empty">Waiting for litigant debate…</div>
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
    <div className="sbox sbox--orch">
      {/* Header */}
      <div className="sbox-hd sbox-hd--orch">
        <span className="sbox-label sbox-label--orch">Orchestrator / Consensus</span>
        <div className="sbox-hd-right--orch">
          <button onClick={handleSave} title="Save" className="sbox-btn sbox-btn--orch">⬇</button>
          <button onClick={handlePrint} title="Print" className="sbox-btn sbox-btn--orch">🖨</button>
        </div>
      </div>
      {/* Body */}
      <div ref={scrollRef} className="sbox-bd sbox-bd--orch">
        {question && <DialogLine key="you" item={youItem} />}
        {items.map(item => <DialogLine key={item.id} item={item} />)}
        {items.length === 0 && question && (
          <div className="sbox-empty sbox-empty--mt">Courtroom assembling…</div>
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
  // Every value interpolated below comes from user input (question) or
  // AI-generated text that can echo back attacker-supplied content.
  // Building raw HTML via document.write() without escaping is a DOM XSS
  // vector — a crafted question like "<script>...</script>" surviving into
  // the model's output would execute in this popup window, which shares the
  // page's origin and Firebase Auth session context.
  const esc = (s: unknown): string =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
    );

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Litigant AI Session — ${esc(state.question.slice(0, 60))}</title>
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
    <strong>Question:</strong> ${esc(state.question)}<br/>
    ${state.template ? `<strong>Template:</strong> ${esc(state.template.title)}<br/>` : ""}
    <strong>Confidence:</strong> <span class="badge">${esc(state.confidence)}%</span>
    &nbsp; <strong>Credits:</strong> ${esc(state.creditsUsed)}
    &nbsp; <strong>Date:</strong> ${esc(new Date().toLocaleDateString())}
  </div>
  <h2>Final Answer</h2>
  <pre>${esc(state.finalAnswer || "No final answer generated.")}</pre>
  ${state.artifacts ? `<h2>Artifacts</h2><pre>${esc(state.artifacts)}</pre>` : ""}
  <h2>Debate Notes</h2>
  <pre>${esc(state.debateNotes || "No debate notes.")}</pre>
  <h2>Sources &amp; Caveats</h2>
  <pre>${esc(state.caveats)}</pre>
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
  const { user, userProfile, isAdmin } = useAuth();
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
        artifactType:     (userProfile.defaultSettings.artifactType as CourtConfig["artifactType"]) ?? "auto",
      }
    : undefined;
  const { state, run, stop, reset, acceptPartial, continueSession, submitRebuttal, setQuestion, setTemplate, setConfig, setSeatAI, applyFeedbackGrades } = useBrainSession(savedConfig);
  const [, navigate] = useLocation();

  const [configOpen, setConfigOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [feedbackGiven, setFeedbackGiven] = useState<"good" | "bad" | "warn" | null>(null);
  const [rebuttalChallenge, setRebuttalChallenge] = useState("");
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
  const [toolBanner, setToolBanner] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("templateId");
    if (tid && state.phase === "idle" && !state.template) {
      const template = TEMPLATES.find((t) => t.id === tid);
      if (template) {
        setTemplate(template);
        setConfig(template.defaultConfig);
        setToolBanner(template.title);
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
    if (userProfile && userProfile.creditBalance < estimatedCreditsHigh) {
      toast.error(`You need at least ${estimatedCreditsHigh} credits to run this session.`, {
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

  const { maxLitigants } = useLimits();

  function handleAddLitigant() {
    const next = Math.min(state.config.litigantCount + 1, maxLitigants);
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
  // Padded high-end estimate (mirrors ConfigPanel's credHigh formula); used for all credit gates
  // so the UI's displayed safety margin actually protects the credit system.
  const estimatedCreditsHigh = estimatedCredits + (state.config.conscience ? 1 : 0) + Math.ceil(estimatedCredits * 0.4);

  // Live credit health — from Firestore via useUserProfile (updates as backend deducts)
  const creditsCritical = credits < 10;
  const creditsLow = credits < 50 && !creditsCritical;
  const insufficientCredits = credits < estimatedCreditsHigh;

  const filteredTemplates =
    activeCategory === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === activeCategory);

  // Activity log renderer (shared across idle/running/complete)
  function ActivityLogSection() {
    return (
      <div className="actlog">
        <button onClick={() => setActivityLogOpen((v) => !v)} className="actlog-hd">
          <span className="actlog-hd-label">
            Activity Log
            {isRunning && [0, 120, 240].map((d) => (
              <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce inline-block" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
          <span className="actlog-chevron">{activityLogOpen ? "▼" : "▶"}</span>
        </button>
        {activityLogOpen && (
          <div ref={activityLogRef} className="actlog-bd">
            {state.activityLog.map((entry, i) => {
              const col = entry.startsWith("[Courtroom]") ? "#7ab87a"
                : entry.startsWith("[Orchestrator]") ? "#d4b75a"
                : entry.startsWith("[Moderator]") ? "#6ab4c0"
                : entry.startsWith("[System]") ? "#5a5a5a"
                : "#7ab87a";
              return <div key={i} className="actlog-entry" style={{ color: col }}>{entry}</div>;
            })}
            {state.activityLog.length === 0 && <div className="actlog-entry" style={{ color: "#3a5a3a" }}>Waiting…</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <ConfigPanel
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        config={state.config}
        onChange={setConfig}
        uid={user?.uid}
        onboardingComplete={userProfile?.onboardingComplete}
        isAdmin={isAdmin}
      />

      {/* ── HEADER NAV — Configure | Sessions | state controls ── */}
      <div className="session-nav">
        <button onClick={() => setConfigOpen(true)} className="session-nav-btn">
          ⚙ Configure
        </button>
        <button onClick={() => navigate("/sessions")} className="session-nav-btn">
          📂 Sessions
        </button>
        {isRunning && (
          <button onClick={handleStop} className="session-nav-btn session-nav-btn--full session-nav-btn--stop">
            ⏹ Stop Trial
          </button>
        )}
        {(isComplete || isError) && (
          <button onClick={handleReset} className="session-nav-btn session-nav-btn--full session-nav-btn--reset">
            ↺ New Trial
          </button>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="lgt-container">
      <section className="section">

      {/* ── CONVERSATION PANEL ── */}
      <div className="session-conv">
        <div className="session-conv-label">Conversation</div>

        {/* Tool page pre-load banner */}
        {toolBanner && isIdle && (
          <div className="session-tool-banner">
            <LayoutTemplate style={{ width: 13, height: 13, color: "#7ab87a", flexShrink: 0 }} />
            <span className="session-tool-banner-text">
              Pre-loaded: <strong>{toolBanner}</strong>
            </span>
            <button
              onClick={() => { setTemplate(null); setToolBanner(null); }}
              className="session-tool-banner-clear"
              title="Start fresh instead"
            >✕</button>
          </div>
        )}

        {/* Confidence + Credits bars — always visible */}
        <div className="session-meters">
          <div>
            <div className="session-meter-hd">
              <span>Confidence</span>
              <span className="session-meter-val" style={{ color: state.confidence >= state.config.confidenceTarget ? "#00c853" : "#7ab87a" }}>
                {state.confidence}% / {state.config.confidenceTarget}%
              </span>
            </div>
            <div className="session-meter-track">
              <div className="session-meter-fill" style={{ background: state.confidence >= state.config.confidenceTarget ? "#00c853" : "rgba(0,200,83,.55)", width: `${Math.min(100, (state.confidence / state.config.confidenceTarget) * 100)}%` }} />
            </div>
          </div>
          <div>
            <div className="session-meter-hd">
              <span>Credits Used</span>
              <span className="session-meter-val">{state.creditsUsed} / ~{estimatedCredits} est</span>
            </div>
            <div className="session-meter-track">
              <div className="session-meter-fill" style={{ background: "rgba(0,200,83,.4)", width: `${Math.min(100, (state.creditsUsed / Math.max(estimatedCredits, 1)) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Running/paused status badge */}
        {isRunning && (
          <div className="session-running-badge">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
            ⚡ Brain is thinking…
            {state.currentRound > 0 && state.currentRound < 99 && (
              <span className="session-round-label">
                Revolution {state.currentRound} / {state.config.maxIterations}
              </span>
            )}
          </div>
        )}

        {/* Paused decision card */}
        {isPaused && state.pauseReason && (
          <div className="session-pause-card">
            <div className="session-pause-title">
              ⏸ {state.pauseReason === "credit_cap" ? `Credit cap reached — ${Math.round(state.confidence)}% confidence` : `${state.config.maxIterations} rounds done — ${Math.round(state.confidence)}% (target ${state.config.confidenceTarget}%)`}
            </div>
            <div className="session-pause-btns">
              {credits === 0 ? (
                <button onClick={() => navigate("/billing")} className="session-pause-btn-primary">Top Up Wallet</button>
              ) : (
                <button onClick={() => { void continueSession(); }} className="session-pause-btn-primary">Continue — {credits} cr</button>
              )}
              <button onClick={acceptPartial} className="session-pause-btn-secondary">Accept answer</button>
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div style={{ background: "rgba(200,64,64,.08)", border: "1px solid rgba(200,64,64,.3)", borderRadius: 9, padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#ff6b6b", fontWeight: 700, marginBottom: 6 }}>Session Error</div>
            <div style={{ fontSize: 12, color: "#9a5a5a", marginBottom: 10 }}>{state.errorMessage}</div>
            <button onClick={handleReset} style={{ background: "transparent", border: "1px solid #c84040", borderRadius: 8, color: "#ff6b6b", padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>Try Again</button>
          </div>
        )}

        {/* V29 conversation boxes — shown when there's a question */}
        {state.question && !isIdle && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
          </div>
        )}

        {/* Complete: feedback + export + output tabs */}
        {isComplete && (
          <>
            {/* Feedback + export */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 0" }}>
              <span style={{ fontSize: 12, color: "#7ab87a" }}>Helpful?</span>
              {(["good", "bad", "warn"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handleFeedback(r)}
                  disabled={feedbackGiven !== null}
                  style={{
                    width: 34, height: 34, borderRadius: 8, fontSize: 16,
                    background: feedbackGiven === r ? "rgba(0,200,83,.15)" : "transparent",
                    border: feedbackGiven === r ? "1px solid #00c853" : "1px solid #1d331d",
                    cursor: feedbackGiven !== null ? "default" : "pointer", color: "#eef7ee",
                  }}
                >
                  {r === "good" ? "👍" : r === "bad" ? "👎" : "⚠️"}
                </button>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button onClick={handleCopyMarkdown} style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid #1d331d", borderRadius: 7, color: "#eef7ee", cursor: "pointer" }}>Copy</button>
                <button onClick={handleDownloadMarkdown} style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid #1d331d", borderRadius: 7, color: "#eef7ee", cursor: "pointer" }}>MD</button>
                <button onClick={handleExportPDF} style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid #1d331d", borderRadius: 7, color: "#eef7ee", cursor: "pointer" }}>Print</button>
              </div>
            </div>

            {/* Output tabs */}
            <Tabs defaultValue="answer">
              <TabsList className="bg-black/30 border border-white/8 mb-2 flex-wrap h-auto gap-y-1">
                <TabsTrigger value="answer" className="text-xs">Final Answer</TabsTrigger>
                <TabsTrigger value="debate" className="text-xs">Debate</TabsTrigger>
                <TabsTrigger value="transcript" className="text-xs">Transcript</TabsTrigger>
                <TabsTrigger value="caveats" className="text-xs">Caveats</TabsTrigger>
              </TabsList>
              <TabsContent value="answer">
                <div style={{ border: "1px solid rgba(0,200,83,.2)", borderRadius: 10, background: "rgba(0,200,83,.05)", padding: "14px" }}>
                  <div style={{ fontSize: 11, color: "#00c853", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Verdict — {state.confidence}% confidence
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: "#eef7ee", whiteSpace: "pre-wrap" }}>
                    {state.finalAnswer || "No final answer generated."}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="debate">
                <div style={{ border: "1px solid #1d331d", borderRadius: 10, padding: "14px", background: "rgba(0,0,0,.12)" }}>
                  <div style={{ fontSize: 11, color: "#7ab87a", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Debate Notes</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: "#9aaa9a", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                    {state.debateNotes || "No debate notes recorded."}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="transcript">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {state.runtimeFeed.some((f) => isLitigantRole(f.role)) && (
                    <LitigantVoicesBox items={state.runtimeFeed.filter((f) => isLitigantRole(f.role))} adversarial={state.config.courtMode === "adversarial"} />
                  )}
                  <OrchestratorBox question={state.question} items={state.runtimeFeed.filter((f) => isOrchestratorRole(f.role))} />
                </div>
              </TabsContent>
              <TabsContent value="caveats">
                <div style={{ border: "1px solid rgba(243,210,106,.2)", borderRadius: 10, background: "rgba(243,210,106,.04)", padding: "14px" }}>
                  <div style={{ fontSize: 11, color: "#f3d26a", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Sources & Caveats</div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: "#eef7ee", whiteSpace: "pre-wrap", marginBottom: 10 }}>{state.caveats}</div>
                  <div style={{ fontSize: 12, color: "#5a5a3a", borderTop: "1px solid rgba(243,210,106,.1)", paddingTop: 10 }}>
                    Litigant AI provides AI-generated reasoning. Not legal, medical, financial, or professional advice.
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* ── Challenge the Verdict ── */}
            <div style={{ border: "1px solid rgba(0,200,83,.25)", borderRadius: 10, background: "rgba(0,200,83,.03)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid rgba(0,200,83,.12)", background: "rgba(0,200,83,.06)" }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00c853" }}>
                  ⚖ Challenge the Verdict
                </span>
                {state.rebuttalRound > 0 && (
                  <span style={{ fontSize: 10, padding: "2px 8px", background: "rgba(0,200,83,.12)", border: "1px solid rgba(0,200,83,.3)", borderRadius: 20, color: "#7ab87a", fontWeight: 700, marginLeft: 4 }}>
                    Rebuttal {state.rebuttalRound}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#3a5a3a" }}>~{estimatedCredits} cr to reconvene</span>
              </div>

              {/* Past challenge trail */}
              {state.rebuttals.length > 0 && (
                <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(0,200,83,.08)", display: "flex", flexDirection: "column", gap: 5 }}>
                  {state.rebuttals.map((r) => (
                    <div key={r.round} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11 }}>
                      <span style={{ color: "#3a5a3a", fontWeight: 700, whiteSpace: "nowrap", minWidth: 28 }}>R{r.round}</span>
                      <span style={{ color: "#5a7a5a", fontStyle: "italic" }}>
                        "{r.challenge.length > 90 ? r.challenge.slice(0, 90) + "…" : r.challenge}"
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  value={rebuttalChallenge}
                  onChange={(e) => setRebuttalChallenge(e.target.value)}
                  placeholder="What did the court miss? What assumption is wrong? State your objection and the court will reconvene…"
                  rows={3}
                  style={{ width: "100%", background: "#070f07", border: "1px solid rgba(0,200,83,.2)", borderRadius: 8, color: "#eef7ee", fontSize: 13, padding: "8px 10px", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6 }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(0,200,83,.5)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(0,200,83,.2)"; }}
                />
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => {
                      const challenge = rebuttalChallenge.trim();
                      if (!challenge) return;
                      setRebuttalChallenge("");
                      void submitRebuttal(challenge);
                    }}
                    disabled={!rebuttalChallenge.trim() || insufficientCredits}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      background: rebuttalChallenge.trim() && !insufficientCredits ? "#00c853" : "rgba(0,200,83,.1)",
                      color: rebuttalChallenge.trim() && !insufficientCredits ? "#000" : "#2a4a2a",
                      fontSize: 13,
                      fontWeight: 800,
                      border: "none",
                      cursor: rebuttalChallenge.trim() && !insufficientCredits ? "pointer" : "not-allowed",
                      transition: "background .15s, color .15s",
                    }}
                  >
                    ⚖ Reconvene the Court
                  </button>
                  <button
                    onClick={handleReset}
                    style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", color: "#3a5a3a", fontSize: 12, border: "1px solid #1d331d", cursor: "pointer" }}
                  >
                    New Case
                  </button>
                </div>
                {insufficientCredits && (
                  <div style={{ fontSize: 11, color: "#c84040", textAlign: "center" }}>
                    Not enough credits to reconvene.{" "}
                    <button onClick={() => navigate("/billing")} style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0 }}>
                      Top up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Idle state ── */}
        {isIdle && (
          <div className="flex flex-col gap-3">

            {/* ── Your Court config card ── */}
            <div className="rounded-xl border border-primary/30 overflow-hidden" style={{ background: "rgba(0,200,83,.04)" }}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-primary/15">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5 text-primary/60" />
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/70">Your Court</span>
                </div>
                <button
                  onClick={() => setConfigOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:text-primary/80 transition-colors"
                >
                  Configure all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="px-3 py-2.5 flex flex-wrap gap-2 items-center">
                {/* Litigant count inline stepper */}
                <div className="flex items-center gap-0 border border-primary/25 rounded-lg overflow-hidden bg-primary/5">
                  <button
                    onClick={handleRemoveLitigant}
                    className="w-7 h-7 flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors text-base font-bold leading-none"
                    disabled={state.config.litigantCount <= 2}
                  >−</button>
                  <span className="text-[11px] font-mono text-primary/90 px-2 select-none whitespace-nowrap">
                    {state.config.litigantCount} litigants{state.config.litigantCount > 4 ? " · 4 active" : ""}
                  </span>
                  <button
                    onClick={handleAddLitigant}
                    className="w-7 h-7 flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors text-base font-bold leading-none"
                    disabled={state.config.litigantCount >= maxLitigants}
                  >+</button>
                </div>
                {/* Mode pill */}
                <span className="px-2.5 py-1 border border-border/35 rounded-lg text-[11px] text-muted-foreground capitalize bg-transparent">
                  {state.config.debateMode}
                </span>
                {/* Provider pill */}
                <span className="px-2.5 py-1 border border-border/35 rounded-lg text-[11px] text-muted-foreground bg-transparent">
                  {state.config.provider ? (PROVIDER_LABELS[state.config.provider as ProviderName] ?? state.config.provider) : "Default AI"}
                </span>
                {/* Confidence pill */}
                <span className="px-2.5 py-1 border border-border/35 rounded-lg text-[11px] text-muted-foreground bg-transparent">
                  {state.config.confidenceTarget}% target
                </span>
                {/* Est. cost */}
                <span className="ml-auto text-[11px] font-mono text-primary/50">
                  ~{estimatedCredits} cr
                </span>
              </div>
            </div>

            {/* ── Staff Your Court ── */}
            {(() => {
              const seatMap = state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount);
              const namedSeats = [
                { id: "orchestrator", icon: "🎙", purpose: "Talks to you. Delivers the final verdict." },
                { id: "moderator",   icon: "⚖",  purpose: "Controls courtroom flow. Builds the briefing." },
                { id: "architect",   icon: "📐", purpose: "Defines the artifact structure before building." },
                { id: "builder",     icon: "🔨", purpose: "Builds the requested artifact or implementation." },
                { id: "auditor",     icon: "🔍", purpose: "Final quality gate — decides what ships." },
              ];
              return (
                <div className="rounded-xl border border-border/30 overflow-hidden">
                  {/* header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/20" style={{ background: "rgba(255,255,255,.025)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">⚖</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Staff Your Court</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40">tap any seat to assign an AI</span>
                  </div>

                  {/* Litigants row */}
                  <div className="px-3 pt-2.5 pb-1.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">
                        Litigants — your debaters
                      </span>
                      <div className="flex items-center gap-0 border border-primary/20 rounded-md overflow-hidden">
                        <button
                          onClick={handleRemoveLitigant}
                          disabled={state.config.litigantCount <= 2}
                          className="w-5 h-5 flex items-center justify-center text-primary/50 hover:text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors text-xs font-bold"
                        >−</button>
                        <span className="text-[10px] font-mono text-primary/70 px-1.5">{state.config.litigantCount}{state.config.litigantCount > 4 ? "/4" : ""}</span>
                        <button
                          onClick={handleAddLitigant}
                          disabled={state.config.litigantCount >= maxLitigants}
                          className="w-5 h-5 flex items-center justify-center text-primary/50 hover:text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors text-xs font-bold"
                        >+</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {seatMap.litigants.map((seat, i) => (
                        <button
                          key={i}
                          onClick={() => handleSeatClick("litigant", i)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-primary/20 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 transition-all group"
                        >
                          <span className="text-[10px] text-primary/50 font-mono">L{i + 1}</span>
                          <span className="text-[11px] font-medium text-primary/80 group-hover:text-primary transition-colors">
                            {getSeatAIShortName(seat.provider)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="mx-3 border-t border-border/15 my-1.5" />

                  {/* Named support roles */}
                  <div className="px-3 pb-2.5 pt-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Support roles</div>
                    <div className="grid grid-cols-1 gap-1">
                      {namedSeats.map(({ id, icon, purpose }) => {
                        const assignment = seatMap[id as keyof typeof seatMap] as SeatAssignment | undefined;
                        const aiName = assignment ? getSeatAIShortName(assignment.provider) : "Claude";
                        return (
                          <button
                            key={id}
                            onClick={() => handleSeatClick(id)}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border border-border/20 hover:border-border/50 hover:bg-white/5 transition-all text-left group"
                          >
                            <span className="text-base leading-none w-5 text-center shrink-0">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-foreground/80 capitalize group-hover:text-foreground transition-colors">{id}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground/60 font-mono">{aiName}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground/50 leading-snug mt-0.5">{purpose}</div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground/70 shrink-0 transition-colors" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Court status + credit pill */}
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/70">Court Ready</span>
              </div>
              <button
                onClick={insufficientCredits ? () => navigate("/billing") : undefined}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors",
                  creditsCritical
                    ? "border-red-500/40 text-red-400 bg-red-500/5 hover:bg-red-500/10 cursor-pointer"
                    : creditsLow
                    ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/10 cursor-pointer"
                    : "border-primary/25 text-primary/70 bg-primary/5 cursor-default"
                )}
              >
                <Zap className="w-3 h-3" />
                {credits} cr · {plan}
                {insufficientCredits && <span className="ml-1 underline">top up</span>}
              </button>
            </div>

            {/* Suggested prompts + template, collapsed into an accordion */}
            <Accordion type="single" collapsible className="border border-border/20 rounded-xl px-3">
              <AccordionItem value="get-started" className="border-b-0">
                <AccordionTrigger className="py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:no-underline hover:text-muted-foreground">
                  Get started
                </AccordionTrigger>
                <AccordionContent className="pt-0 pb-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 px-0.5 mb-0.5">
                      Try asking
                    </div>
                    {[
                      "Is our go-to-market strategy viable for enterprise?",
                      "Should we raise a Series A now or wait 12 months?",
                      "Is this contract clause actually enforceable?",
                      "Which of these two technical approaches is sounder?",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setQuestion(prompt)}
                        className="group text-left px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground border border-border/30 hover:border-primary/35 rounded-lg bg-transparent hover:bg-primary/5 transition-all"
                      >
                        <span className="text-primary/40 group-hover:text-primary/60 mr-1 transition-colors">"</span>
                        {prompt}
                        <span className="text-primary/40 group-hover:text-primary/60 transition-colors">"</span>
                      </button>
                    ))}
                  </div>

                  {/* Template button */}
                  <button
                    onClick={() => setTemplateSheetOpen(true)}
                    className="mt-2 flex items-center gap-3 p-3 border border-primary/20 rounded-xl hover:border-primary/45 hover:bg-primary/5 transition-all text-left group w-full"
                    style={{ background: "rgba(0,200,83,.03)" }}
                  >
                    <div className="w-8 h-8 rounded-lg border border-primary/25 bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <LayoutTemplate className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-primary leading-none mb-0.5">Use a template</div>
                      <div className="text-[11px] text-muted-foreground">{TEMPLATES.length} purpose-built trials</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-primary/40 group-hover:text-primary/70 transition-colors shrink-0" />
                  </button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

          </div>
        )}

        {/* ── INPUT AREA ── */}
        {(isIdle || isComplete) && (
          <div className="flex flex-col gap-2 pt-1">
            {state.template ? (
              <div className="flex flex-col gap-2">
                {/* Template header */}
                <div className="flex items-center gap-2 px-0.5">
                  <Gavel className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  <span className="text-xs font-semibold text-primary/80">{state.template.title}</span>
                  <button
                    onClick={() => { setTemplate(null); setFieldValues({}); }}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border border-border/30 hover:border-red-500/40 text-[11px] font-medium text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear template
                  </button>
                </div>
                {/* Template fields */}
                {state.template.inputFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <span className="text-[11px] text-primary/60 whitespace-nowrap w-20 shrink-0 font-medium">{field.label}</span>
                    <Input
                      type={field.type === "url" ? "url" : "text"}
                      placeholder={field.placeholder}
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
                      className="h-9 text-sm flex-1 focus-visible:ring-1 focus-visible:ring-primary/60"
                      style={{ background: "#0d1a0d", border: "1px solid #1d331d", color: "#eef7ee" }}
                    />
                  </div>
                ))}
                <button
                  onClick={handleRun}
                  disabled={insufficientCredits}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: insufficientCredits ? "rgba(0,200,83,.15)" : "#00c853",
                    color: insufficientCredits ? "rgba(0,200,83,.35)" : "#000",
                    cursor: insufficientCredits ? "not-allowed" : "pointer",
                  }}
                >
                  <Play className="w-4 h-4" />
                  Run Trial
                </button>
              </div>
            ) : isComplete ? null : (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Textarea
                    placeholder="Put your question on trial…"
                    value={state.question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isRunning) handleRun(); } }}
                    className="resize-none focus-visible:ring-1 focus-visible:ring-primary/60 text-sm leading-relaxed"
                    style={{ minHeight: 96, background: "#0d1a0d", border: "1px solid #1d331d", borderRadius: 12, color: "#eef7ee", padding: "12px 14px" }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground/30 flex-1">Enter to run · Shift+Enter for new line</span>
                  <button
                    onClick={handleRun}
                    disabled={!state.question.trim() || insufficientCredits}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shrink-0"
                    style={{
                      background: (!state.question.trim() || insufficientCredits) ? "rgba(0,200,83,.15)" : "#00c853",
                      color: (!state.question.trim() || insufficientCredits) ? "rgba(0,200,83,.3)" : "#000",
                      cursor: (!state.question.trim() || insufficientCredits) ? "not-allowed" : "pointer",
                    }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Run Trial
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RUNTIME CONTROL PANEL ── */}
      {!isIdle && (
        <div style={{ border: "1px solid #1d331d", borderRadius: 12, padding: 8, background: "linear-gradient(160deg,rgba(14,26,14,.92),rgba(7,16,7,.92))", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: "#00c853", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 800, marginBottom: 2 }}>Runtime Control</div>
          <RuntimeControl
            starting={credits + state.creditsUsed}
            current={credits}
            used={state.creditsUsed}
            round={state.currentRound}
            maxRound={state.config.maxIterations}
            cap={state.estimatedCredits}
            mode={state.config.courtMode}
          />
          <ActivityLogSection />
        </div>
      )}

      {/* ── COURT DIAGRAM — at the bottom ── */}
      <div className="shrink-0 relative" style={{ height: "clamp(200px, 60vw, 480px)" }}>
        <CourtDiagram
          activeRole={state.activeRole}
          activeAttempt={state.activeAttempt}
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
        {(isRunning || isComplete) && state.currentRound > 0 && state.currentRound < 99 && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 border border-primary/25 text-[10px] font-mono text-primary/80 pointer-events-none">
            <span className={cn("w-1.5 h-1.5 rounded-full bg-primary", isRunning && "animate-pulse")} />
            Revolution {state.currentRound} / {state.config.maxIterations}
          </div>
        )}
        <div className={cn(
          "absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 border text-[10px] font-mono pointer-events-none",
          creditsCritical ? "border-red-500/40 text-red-400"
          : creditsLow ? "border-yellow-500/40 text-yellow-400"
          : "border-primary/25 text-primary/70"
        )}>
          <Zap className="w-2.5 h-2.5" />
          {credits} cr
        </div>
      </div>

      {/* ── SEAT INSPECTOR ── */}
      {inspectorSeat && (
        <SeatInspector
          seatId={inspectorSeat.seatId}
          litIndex={inspectorSeat.litIndex}
          litigantCount={state.config.litigantCount}
          seatMap={state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount)}
          grades={state.grades}
          onClose={() => setInspectorSeat(null)}
          onUpdate={(seatId, assignment, li) => handleSeatUpdate(seatId, assignment, li)}
        />
      )}

      </section>
      </div>{/* /lgt-container */}

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
    </>
  );
}
