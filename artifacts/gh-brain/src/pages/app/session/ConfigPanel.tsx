import { useState, useRef, useEffect } from "react";
import { HelpCircle, DollarSign, GraduationCap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getProviders, estimateCredits, type ProviderInfo, type ModelInfo } from "@/services/providerService";
import { saveUserConfig, type UserProfile } from "@/services/firestoreService";
import type { CourtConfig } from "@/data/templates";

// ── V29 helpers (local to this module) ───────────────────────────────────────

function V29Field({
  label, desc, tooltip, children,
}: { label: string; desc?: string; tooltip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">{label}</div>
        {tooltip && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" tabIndex={-1} className="text-primary/40 hover:text-primary/80 transition-colors" aria-label={`More info about ${label}`}>
                <HelpCircle className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="max-w-[280px] text-[11px] leading-relaxed p-3">
              {tooltip}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {children}
      {desc && <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{desc}</p>}
    </div>
  );
}

function V29OptionCard({
  selected, onClick, icon: Icon, label, description, tag,
}: {
  selected: boolean; onClick: () => void; icon: React.ElementType;
  label: string; description: string; tag?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full text-left rounded-lg border p-3 transition-all duration-150",
        "hover:border-primary/60 hover:bg-primary/5",
        selected ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border/60 bg-card/40"
      )}
    >
      {tag && (
        <span className="absolute top-2 right-2 text-[9px] font-semibold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
          {tag}
        </span>
      )}
      <div className="flex items-start gap-2.5">
        <div className={cn("mt-0.5 shrink-0 rounded-md p-1.5", selected ? "bg-primary/20" : "bg-muted/50")}>
          <Icon className={cn("w-3.5 h-3.5", selected ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className={cn("min-w-0", tag ? "pr-12" : "pr-1")}>
          <div className="font-semibold text-xs flex items-center gap-1.5">
            {label}
            {selected && <Check className="w-3 h-3 text-primary shrink-0" />}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
    </button>
  );
}

const V29_SELECT = "bg-[#0d1a0d] border border-primary/30 text-sm text-foreground hover:border-primary/60 focus:border-primary h-10";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConfigPanelProps {
  open: boolean;
  onClose: () => void;
  config: CourtConfig;
  onChange: (c: Partial<CourtConfig>) => void;
  uid?: string;
  onboardingComplete?: boolean;
  isAdmin?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfigPanel({ open, onClose, config, onChange, uid, onboardingComplete }: ConfigPanelProps) {
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [atBottom, setAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasChanges = useRef(false);
  const latestConfigRef = useRef<CourtConfig>(config);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { latestConfigRef.current = config; }, [config]);

  useEffect(() => {
    if (open) {
      hasChanges.current = false;
      setSaveState("idle");
      getProviders().then((p) => setAvailableProviders(p.providers));
    }
  }, [open]);

  async function doSave(showToast = false): Promise<boolean> {
    if (!uid || !onboardingComplete) return false;
    setSaveState("saving");
    try {
      const c = latestConfigRef.current;
      const rawSettings = {
        conscience: c.conscience, outputScope: c.outputScope,
        debateMode: c.debateMode, aiReasoning: c.aiReasoning,
        outputStrategy: c.outputStrategy, format: c.format,
        artifactType: c.artifactType, confidenceTarget: c.confidenceTarget,
        maxIterations: c.maxIterations, maxCredits: c.maxCredits,
        litigantCount: c.litigantCount,
        responseMode: c.responseMode, outputFormat: c.outputFormat,
        provider: c.provider, model: c.model,
        intelligenceLevel: c.intelligenceLevel,
        outputPreferenceMode: c.outputPreferenceMode,
      };
      const settings = Object.fromEntries(
        Object.entries(rawSettings).filter(([, v]) => v !== undefined)
      ) as UserProfile["defaultSettings"];
      await saveUserConfig(uid, settings);
      hasChanges.current = false;
      setSaveState("saved");
      if (showToast) toast.success("Settings saved to your profile");
      setTimeout(() => setSaveState("idle"), 2000);
      return true;
    } catch (err) {
      console.error("[Session] saveUserConfig failed:", err);
      setSaveState("idle");
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not save: ${msg}`);
      return false;
    }
  }

  function handleSheetScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  }

  function handleChange(partial: Partial<CourtConfig>) {
    latestConfigRef.current = { ...latestConfigRef.current, ...partial };
    hasChanges.current = true;
    onChange(partial);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(false), 1500);
  }

  const selectedProvider = availableProviders.find((p) => p.name === config.provider) ?? availableProviders[0];
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

  async function handleClose() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (hasChanges.current) await doSave(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-full max-w-lg bg-[#060e06] border border-primary/40 p-0 flex flex-col max-h-[90vh]">
        <div ref={scrollRef} onScroll={handleSheetScroll} className="overflow-y-auto flex-1">
          <TooltipProvider delayDuration={150}>
          <div className="px-5 py-5 space-y-5">
            <DialogHeader className="pb-0">
              <DialogTitle className="text-xl font-bold text-primary tracking-tight">Mission Briefing</DialogTitle>
            </DialogHeader>

            {/* OUTPUT PREFERENCE */}
            <V29Field
              label="Output Preference"
              tooltip="Controls whether the court builds a structured document or delivers a plain synthesised answer. 'Answer only' skips the Architect and Builder stages — faster and cheaper, ideal for questions that just need a verdict. 'Document' always produces a formatted report. 'Auto' lets the court decide based on the question type."
            >
              <Select
                value={config.outputPreferenceMode ?? "auto"}
                onValueChange={(v) => handleChange({ outputPreferenceMode: v as CourtConfig["outputPreferenceMode"] })}
              >
                <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" label="Auto (let the court decide)">
                    <span className="text-xs text-muted-foreground">Court decides whether a document is needed based on the question.</span>
                  </SelectItem>
                  <SelectItem value="answer-only" label="Answer only">
                    <span className="text-xs text-muted-foreground">Skip Architect & Builder — deliver a plain synthesised answer. Faster &amp; cheaper.</span>
                  </SelectItem>
                  <SelectItem value="document" label="Document">
                    <span className="text-xs text-muted-foreground">Always produce a structured report or document regardless of question type.</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </V29Field>

            {/* CONSCIENCE */}
            <V29Field
              label="Conscience"
              tooltip="Conscience is a governing mandate — a fixed block of instructions appended directly to every seat's system prompt, not a separate filter that reviews output afterward. Its current version (Canon v2, Execution-Honest) tells every AI, before it writes a single word: state what the evidence actually shows even if uncomfortable; never assert something it can't substantiate, and admit it doesn't know when that's true; never give a diplomatic non-answer to dodge conflict; explicitly name what information is missing; and report honestly if its own reasoning led somewhere unexpected, rather than reverse-engineering an argument to fit a conclusion. So it shapes how each seat reasons from the first token, not just what gets shown after. It costs a small credit surcharge (+1 Cr) because it adds to every prompt. When OFF, seats get no such mandate and respond however the base model naturally would — which can be more evasive, hedged, or unwilling to state hard conclusions plainly. An admin can update the exact wording of this mandate at any time without a code deploy."
            >
              <Select value={config.conscience ? "on" : "off"} onValueChange={(v) => handleChange({ conscience: v === "on" })}>
                <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on" label="Conscience ON">
                    <span className="text-xs text-muted-foreground">Seats mandated to state evidence honestly and admit uncertainty. +1 Cr</span>
                  </SelectItem>
                  <SelectItem value="off" label="Conscience OFF">
                    <span className="text-xs text-muted-foreground">No governing mandate — seats respond however the base model naturally would.</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </V29Field>

            {/* DEBATE MODE */}
            <V29Field
              label="Debate Mode"
              tooltip="Sets how the seats treat each other's arguments. Adversarial: each seat actively challenges others, hunts for contradictions, and attacks weak reasoning — good for pressure-testing an idea. Collaborative: seats build on each other's points and work toward synthesis rather than confrontation — good for exploring or refining an idea together."
            >
              <Select value={config.debateMode} onValueChange={(v) => handleChange({ debateMode: v as CourtConfig["debateMode"] })}>
                <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adversarial" label="Adversarial">
                    <span className="text-xs text-muted-foreground">Seats challenge and attack weak arguments. Best for stress-testing.</span>
                  </SelectItem>
                  <SelectItem value="collaborative" label="Collaborative">
                    <span className="text-xs text-muted-foreground">Seats build on each other toward a shared conclusion.</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </V29Field>

            {/* AI REASONING */}
            <V29Field
              label="AI Reasoning"
              tooltip="Controls whether seats hear each other. Independent: each AI only sees its own prior turns, never the other seats' responses — faster and cheaper, good for gathering distinct unbiased takes. Chain: each AI reads the entire transcript so far before responding, enabling real cross-examination and rebuttal — richer, but costs significantly more credits since every seat re-reads a growing transcript every round."
            >
              <Select value={config.aiReasoning} onValueChange={(v) => handleChange({ aiReasoning: v as CourtConfig["aiReasoning"] })}>
                <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent" label="Independent">
                    <span className="text-xs text-muted-foreground">Each AI builds on its own turns only. Faster and cheaper.</span>
                  </SelectItem>
                  <SelectItem value="chain" label="Chain">
                    <span className="text-xs text-muted-foreground">Each AI reads the full transcript before responding. Uses more credits.</span>
                  </SelectItem>
                </SelectContent>
              </Select>
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
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
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
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1 000</SelectItem>
                  <SelectItem value="2500">2 500</SelectItem>
                </SelectContent>
              </Select>
            </V29Field>

            {/* INTELLIGENCE SLIDER */}
            <div className="space-y-3 pt-1 border-t border-primary/10">
              <div className="flex items-center gap-1.5">
                <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">Intelligence</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" tabIndex={-1} className="text-primary/40 hover:text-primary/80 transition-colors" aria-label="More info about Intelligence">
                      <HelpCircle className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="max-w-[280px] text-[11px] leading-relaxed p-3">
                    Controls AI capability across all seats. Left is more economical; right uses the strongest available models. Each seat can be tuned individually from the courtroom diagram.
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-3">
                <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min={0} max={100}
                  value={config.intelligenceLevel ?? 50}
                  onChange={(e) => handleChange({ intelligenceLevel: Number(e.target.value), provider: undefined, model: undefined })}
                  className="flex-1 cursor-pointer"
                  style={{ accentColor: "hsl(var(--primary, 120 100% 50%))" }}
                />
                <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>

            {/* ESTIMATED RUN COST */}
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-1">
              <div className="text-[10px] font-bold tracking-widest uppercase text-primary/60">Estimated Run Cost</div>
              <div className="text-2xl font-bold text-primary">{credLow}–{credHigh} Credits</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Based on {config.litigantCount} litigants, {config.debateMode} mode,{" "}
                {confidenceLabel}{config.conscience ? " + conscience gate (+1 Cr)" : ""}.
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex flex-col gap-2 pb-2">
              <Button
                onClick={async () => { const saved = await doSave(true); if (saved) setTimeout(onClose, 700); }}
                disabled={saveState === "saving"}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "Save Settings"}
              </Button>
              {onboardingComplete
                ? <p className="text-[11px] text-muted-foreground/50 text-center">Changes also save automatically as you go</p>
                : uid && <p className="text-[11px] text-muted-foreground/50 text-center">Complete onboarding to persist settings</p>
              }
            </div>
          </div>
          </TooltipProvider>
        </div>
        {!atBottom && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#060e06] to-transparent" />
        )}
      </DialogContent>
    </Dialog>
  );
}
