import { useLimits } from "@/hooks/useLimits";
import { CourtConfigSchema, RESPONSE_VIEWS, DOCUMENT_TYPES, DOWNLOAD_FORMATS, ANSWER_STYLES, OUTPUT_MODES } from "@workspace/api-zod/session";
import { useSessionQuote } from "@/hooks/useSessionQuote";
import { useState, useRef, useEffect } from "react";
import { HelpCircle, DollarSign, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { saveUserConfig, type UserProfile } from "@/services/firestoreService";
import type { CourtConfig } from "@/data/templates";

// ── V29 helpers (local to this module) ───────────────────────────────────────

function V29Field({
  label, desc, tooltip, children,
}: { label: string; desc?: string; tooltip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="text-xs font-bold tracking-widest uppercase text-primary/60">{label}</div>
        {tooltip && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" tabIndex={-1} className="text-primary/40 hover:text-primary/80 transition-colors" aria-label={`More info about ${label}`}>
                <HelpCircle className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="max-w-[280px] text-xs leading-relaxed p-3">
              {tooltip}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {children}
      {desc && <p className="text-xs text-muted-foreground/70 leading-relaxed">{desc}</p>}
    </div>
  );
}

const V29_SELECT = "bg-[#0d1a0d] border border-primary/30 text-sm text-foreground hover:border-primary/60 focus:border-primary h-10";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConfigPanelProps {
  open: boolean;
  quoteEnabled?: boolean;
  onClose: () => void;
  config: CourtConfig;
  onChange: (c: Partial<CourtConfig>) => void;
  uid?: string;
  onboardingComplete?: boolean;
  isAdmin?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfigPanel({ open, quoteEnabled = true, onClose, config, onChange, uid, onboardingComplete }: ConfigPanelProps) {
  const limits = useLimits();
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
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
    }
  }, [open]);

  async function doSave(showToast = false): Promise<boolean> {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!uid || !onboardingComplete) return false;
    setSaveState("saving");
    try {
      const c = latestConfigRef.current;
      const rawSettings = c;
      const settings = Object.fromEntries(
        Object.entries(rawSettings).filter(([, v]) => v !== undefined)
      ) as UserProfile["defaultSettings"];
      const pending = saveQueue.current.catch(() => {}).then(() => saveUserConfig(uid, settings));
      saveQueue.current = pending;
      await pending;
      if (latestConfigRef.current === c) {
        hasChanges.current = false;
        setSaveState("saved");
      }
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
    latestConfigRef.current = CourtConfigSchema.parse({ ...latestConfigRef.current, ...partial });
    hasChanges.current = true;
    onChange(latestConfigRef.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(false), 1500);
  }

  const quote = useSessionQuote(config, open && quoteEnabled);
  const credLow = quote.data?.estimatedCredits ?? 0;
  const credHigh = credLow;

  const confidenceLabel = {
    80: "80/100", 90: "90/100", 95: "95/100", 99: "99/100",
  }[config.confidenceTarget as 80 | 90 | 95 | 99] ?? `${config.confidenceTarget}/100`;

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
              <DialogTitle className="text-xl font-bold text-primary tracking-tight">Configuration</DialogTitle>
            </DialogHeader>

            <V29Field label="Response view" desc="The selected response is used on screen and in downloads. The full court record remains available.">
              <Select value={config.outputStrategy} onValueChange={(v) => handleChange({outputStrategy: v as CourtConfig["outputStrategy"], ...(v === "artifact" ? {outputPreferenceMode: "document" as const} : {})})}>
                <SelectTrigger aria-label="Response view" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(RESPONSE_VIEWS).map(([v,label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>
            <V29Field label="Document creation" desc="Answer only skips document building. Auto builds one when needed. Always build requests a document every time.">
              <Select value={config.outputPreferenceMode ?? "auto"} onValueChange={(v) => handleChange({outputPreferenceMode: v as CourtConfig["outputPreferenceMode"], ...(v === "answer-only" && config.outputStrategy === "artifact" ? {outputStrategy: "moderator-consensus" as const} : {})})}>
                <SelectTrigger aria-label="Document creation" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(OUTPUT_MODES).map(([v,label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>
            {config.outputPreferenceMode !== "answer-only" && <V29Field label="Document type">
              <Select value={config.artifactType === "none" ? "auto" : config.artifactType} onValueChange={(v) => handleChange({artifactType: v as CourtConfig["artifactType"]})}>
                <SelectTrigger aria-label="Document type" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOCUMENT_TYPES).map(([v,label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>}
            <V29Field label="Answer style" desc="How the court presents its conclusion. Document type controls the separate artifact.">
              <Select value={config.outputFormat} onValueChange={(v) => handleChange({outputFormat: v as CourtConfig["outputFormat"]})}>
                <SelectTrigger aria-label="Answer style" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ANSWER_STYLES).map(([v,label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>
            <V29Field label="Response depth" desc="Controls the detail and length of arguments and the final answer.">
              <Select value={config.responseMode} onValueChange={(v) => handleChange({responseMode: v as CourtConfig["responseMode"]})}>
                <SelectTrigger aria-label="Response depth" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{["concise", "balanced", "thorough"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>
            <V29Field label="Download format" desc="Used by the session download button, including answer-only sessions.">
              <Select value={config.format} onValueChange={(v) => handleChange({format: v as CourtConfig["format"]})}>
                <SelectTrigger aria-label="Download format" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOWNLOAD_FORMATS).map(([v,label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>

            <V29Field label="Litigants">
              <Select value={String(config.litigantCount)} onValueChange={v => handleChange({litigantCount: Number(v)})}>
                <SelectTrigger aria-label="Litigants" className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({length: limits.maxLitigants}, (_,i) => i+1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </V29Field>
            {/* CONSCIENCE */}
            <V29Field
              label="Conscience"
              tooltip="Conscience is a governing mandate — a fixed block of instructions appended directly to every seat's system prompt, not a separate filter that reviews output afterward. Its current version (Canon v2, Execution-Honest) tells every AI, before it writes a single word: state what the evidence actually shows even if uncomfortable; never assert something it can't substantiate, and admit it doesn't know when that's true; never give a diplomatic non-answer to dodge conflict; explicitly name what information is missing; and report honestly if its own reasoning led somewhere unexpected, rather than reverse-engineering an argument to fit a conclusion. So it shapes how each seat reasons from the first token, not just what gets shown after. Its prompt tokens are included in actual usage billing. When OFF, seats get no such mandate and respond however the base model naturally would — which can be more evasive, hedged, or unwilling to state hard conclusions plainly. An admin can update the exact wording of this mandate at any time without a code deploy."
            >
              <Select value={config.conscience ? "on" : "off"} onValueChange={(v) => handleChange({ conscience: v === "on" })}>
                <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on" label="Conscience ON">
                    <span className="text-xs text-muted-foreground">Seats mandated to state evidence honestly and admit uncertainty.</span>
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
              label="AI review target"
              tooltip="The minimum AI review score you want before accepting the result. This is an uncalibrated assessment, not a probability of correctness. More rounds do not guarantee a higher score. Verify important claims against their sources."
            >
              <Select value={String(config.confidenceTarget)} onValueChange={(v) => handleChange({ confidenceTarget: Number(v) })}>
                <SelectTrigger className={V29_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...new Set([50, 60, 70, 80, 85, 90, 95, 99, 100, config.confidenceTarget])].sort((a,b) => a-b).map(n => <SelectItem key={n} value={String(n)}>{n}/100</SelectItem>)}
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
                  {Array.from({length: 20}, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
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
                  {[...new Set([100,250,500,1000,2500,config.maxCredits])].sort((a,b) => a-b).map(n => <SelectItem key={n} value={String(n)}>{n.toLocaleString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </V29Field>

            {/* INTELLIGENCE SLIDER */}
            <div className="space-y-3 pt-1 border-t border-primary/10">
              <div className="flex items-center gap-1.5">
                <div className="text-xs font-bold tracking-widest uppercase text-primary/60">Intelligence</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" tabIndex={-1} className="text-primary/40 hover:text-primary/80 transition-colors" aria-label="More info about Intelligence">
                      <HelpCircle className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="max-w-[280px] text-xs leading-relaxed p-3">
                    Controls AI capability across all seats. Left is more economical; right uses the strongest available models. Each seat can be tuned individually from the courtroom diagram.
                  </PopoverContent>
                </Popover>
              </div>
              {config.intelligenceLevel === undefined && <p className="text-xs text-muted-foreground">Using saved model: {config.model ?? `${config.provider ?? "Default provider"} default`}. Move the slider to choose by capability.</p>}
              <div className="flex items-center gap-3">
                <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  aria-label="Master intelligence"
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
              <div className="text-xs font-bold tracking-widest uppercase text-primary/60">Estimated Run Cost</div>
              <div className="text-2xl font-bold text-primary">{quote.ready ? credHigh : quote.isError ? "Unavailable" : "…"}{quote.ready ? " Credits" : ""}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Based on {config.litigantCount} litigants, {config.debateMode} mode,{" "}
                {confidenceLabel}.
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex flex-col gap-2 pb-2">
              <Button
                onClick={async () => { if (!uid || !onboardingComplete) { onClose(); return; } const saved = await doSave(true); if (saved) setTimeout(onClose, 700); }}
                disabled={saveState === "saving"}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : uid && onboardingComplete ? "Save Settings" : "Apply configuration"}
              </Button>
              {onboardingComplete
                ? <p className="text-xs text-muted-foreground/50 text-center">Changes also save automatically as you go</p>
                : uid && <p className="text-xs text-muted-foreground/50 text-center">Complete onboarding to persist settings</p>
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
