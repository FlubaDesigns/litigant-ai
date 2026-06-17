import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Swords, HelpCircle, BarChart2, Star, Users, AlignLeft, FileText, List, Gavel, ChevronRight, ChevronLeft, Check, Zap, Gauge, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";

async function savePreferences(prefs: {
  defaultSettings: {
    courtMode: string;
    litigantCount: number;
    responseMode: string;
    outputFormat: string;
    confidenceTarget: number;
  };
  onboardingComplete: boolean;
}): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  await fetch(`${API_BASE}/auth/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(prefs),
  });
}

interface Prefs {
  courtMode: string;
  litigantCount: number;
  responseMode: string;
  outputFormat: string;
}

const COURT_MODES = [
  {
    id: "adversarial",
    label: "Adversarial",
    icon: Swords,
    description: "AI litigants actively argue opposing sides. Best for stress-testing ideas and decisions.",
    tag: "Most popular",
  },
  {
    id: "socratic",
    label: "Socratic",
    icon: HelpCircle,
    description: "Guided questioning to uncover hidden assumptions and blind spots.",
    tag: null,
  },
  {
    id: "critique",
    label: "Critique",
    icon: Star,
    description: "A panel of expert reviewers evaluate existing work, plans, or proposals.",
    tag: null,
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: BarChart2,
    description: "Neutral multi-perspective synthesis. Best for research and information gathering.",
    tag: null,
  },
];

const LITIGANT_COUNTS = [2, 3, 4, 5, 6, 8];

const RESPONSE_MODES = [
  {
    id: "concise",
    label: "Concise",
    icon: Zap,
    description: "Key points only. Fast and cost-effective.",
  },
  {
    id: "balanced",
    label: "Balanced",
    icon: Gauge,
    description: "Thorough enough to be useful, concise enough to stay readable.",
    tag: "Recommended",
  },
  {
    id: "thorough",
    label: "Thorough",
    icon: BookOpen,
    description: "Full reasoning and detailed analysis. Uses more credits.",
  },
];

const OUTPUT_FORMATS = [
  {
    id: "report",
    label: "Report",
    icon: FileText,
    description: "Structured sections with headings and detailed analysis.",
    tag: "Most flexible",
  },
  {
    id: "memo",
    label: "Memo",
    icon: AlignLeft,
    description: "Professional memo format, suitable for sharing with colleagues.",
    tag: null,
  },
  {
    id: "bullets",
    label: "Bullets",
    icon: List,
    description: "Scannable bullet points. Great for quick decisions.",
    tag: null,
  },
  {
    id: "verdict",
    label: "Verdict",
    icon: Gavel,
    description: "A direct ruling with brief reasoning. Yes/no clarity.",
    tag: null,
  },
];

const TOTAL_STEPS = 4;

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  label,
  description,
  tag,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  description: string;
  tag?: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full text-left rounded-xl border p-4 transition-all duration-150",
        "hover:border-primary/60 hover:bg-primary/5",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : "border-border/60 bg-card/40"
      )}
    >
      {tag && (
        <span className="absolute top-2 right-2 text-[10px] font-semibold bg-primary/20 text-primary px-2 py-0.5 rounded-full">
          {tag}
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 shrink-0 rounded-lg p-2", selected ? "bg-primary/20" : "bg-muted/50")}>
          <Icon className={cn("w-4 h-4", selected ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div>
          <div className="font-semibold text-sm flex items-center gap-1.5">
            {label}
            {selected && <Check className="w-3.5 h-3.5 text-primary" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({
    courtMode: "adversarial",
    litigantCount: 3,
    responseMode: "balanced",
    outputFormat: "report",
  });

  function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await savePreferences({
        defaultSettings: {
          courtMode: prefs.courtMode,
          litigantCount: prefs.litigantCount,
          responseMode: prefs.responseMode,
          outputFormat: prefs.outputFormat,
          confidenceTarget: 80,
        },
        onboardingComplete: true,
      });
    } catch {
      toast.error("Couldn't save preferences — you can update them in Settings anytime.");
    } finally {
      setSaving(false);
      onComplete();
    }
  }

  const isWelcome = step === 0;
  const isDone = step === TOTAL_STEPS + 1;
  const progress = isWelcome ? 0 : isDone ? 100 : (step / TOTAL_STEPS) * 100;

  const courtLabel = COURT_MODES.find((m) => m.id === prefs.courtMode)?.label ?? prefs.courtMode;
  const responseLabel = RESPONSE_MODES.find((m) => m.id === prefs.responseMode)?.label ?? prefs.responseMode;
  const outputLabel = OUTPUT_FORMATS.find((m) => m.id === prefs.outputFormat)?.label ?? prefs.outputFormat;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm px-4">
      <div className="w-full max-w-xl">

        {/* Progress bar */}
        {!isWelcome && !isDone && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Step {step} of {TOTAL_STEPS}</span>
              <span className="text-primary font-mono">{Math.round(progress)}%</span>
            </div>
            <div className="h-1 bg-border/40 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-border/60 bg-card/80 shadow-2xl p-8"
          >
            {/* ── Step 0: Welcome ── */}
            {isWelcome && (
              <div className="text-center space-y-5">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <Brain className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Welcome to Litigant AI</h1>
                  <p className="text-muted-foreground mt-2 leading-relaxed">
                    Before your first session, let's set up your default preferences. It takes about 60 seconds and you can change everything anytime in <strong>Settings → Configuration</strong>.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                  {[
                    { icon: Swords, label: "Court mode" },
                    { icon: Users, label: "Panel size" },
                    { icon: FileText, label: "Output style" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="rounded-lg border border-border/40 bg-background/40 p-3">
                      <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full mt-2 gap-2 font-semibold" onClick={() => setStep(1)}>
                  Let's go <ChevronRight className="w-4 h-4" />
                </Button>
                <button
                  onClick={handleFinish}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Skip — use defaults
                </button>
              </div>
            )}

            {/* ── Step 1: Court Mode ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">How should your AI panel debate?</h2>
                  <p className="text-sm text-muted-foreground mt-1">This shapes how the litigants interact with each other.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {COURT_MODES.map((m) => (
                    <OptionCard
                      key={m.id}
                      selected={prefs.courtMode === m.id}
                      onClick={() => set("courtMode", m.id)}
                      icon={m.icon}
                      label={m.label}
                      description={m.description}
                      tag={m.tag}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 2: Litigant Count ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">How many AI minds on your panel?</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    More litigants means more perspectives and a deeper debate — and uses more credits per session. You can adjust this for any individual session.
                  </p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {LITIGANT_COUNTS.map((n) => (
                    <button
                      key={n}
                      onClick={() => set("litigantCount", n)}
                      className={cn(
                        "relative rounded-xl border py-4 font-bold text-xl transition-all duration-150",
                        "hover:border-primary/60 hover:bg-primary/5",
                        prefs.litigantCount === n
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40"
                          : "border-border/60 bg-card/40 text-foreground"
                      )}
                    >
                      {n}
                      {n === 3 && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold bg-primary text-black px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          default
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  <Zap className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <span>Selected: <strong className="text-foreground">{prefs.litigantCount} litigants</strong> — no upper limit, the more you choose the more comprehensive the analysis.</span>
                </div>
              </div>
            )}

            {/* ── Step 3: Response Style ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">How much detail do you want?</h2>
                  <p className="text-sm text-muted-foreground mt-1">Controls how deeply the litigants reason through each point.</p>
                </div>
                <div className="flex flex-col gap-3">
                  {RESPONSE_MODES.map((m) => (
                    <OptionCard
                      key={m.id}
                      selected={prefs.responseMode === m.id}
                      onClick={() => set("responseMode", m.id)}
                      icon={m.icon}
                      label={m.label}
                      description={m.description}
                      tag={m.tag}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 4: Output Format ── */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">How should results be presented?</h2>
                  <p className="text-sm text-muted-foreground mt-1">This is how your final answer will be structured.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {OUTPUT_FORMATS.map((m) => (
                    <OptionCard
                      key={m.id}
                      selected={prefs.outputFormat === m.id}
                      onClick={() => set("outputFormat", m.id)}
                      icon={m.icon}
                      label={m.label}
                      description={m.description}
                      tag={m.tag}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Done ── */}
            {isDone && (
              <div className="text-center space-y-5">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <Check className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold">You're all set</h2>
                  <p className="text-sm text-muted-foreground mt-2">Here's your default configuration. Every session starts with these settings — adjust anything in the config panel for individual sessions.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-left">
                  {[
                    { label: "Court mode", value: courtLabel },
                    { label: "Litigants", value: `${prefs.litigantCount} minds` },
                    { label: "Response style", value: responseLabel },
                    { label: "Output format", value: outputLabel },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                      <div className="text-sm font-semibold mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Change these anytime in <strong>Settings → Configuration</strong>.</p>
                <Button className="w-full font-semibold gap-2" onClick={handleFinish} disabled={saving}>
                  {saving ? "Saving…" : "Start my first session"} <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* ── Navigation ── */}
            {!isWelcome && !isDone && (
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/40">
                <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} className="gap-1 text-muted-foreground">
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
                <p className="text-xs text-muted-foreground text-center px-4">
                  You can change this anytime in <strong>Settings → Configuration</strong>
                </p>
                <Button
                  size="sm"
                  onClick={() => setStep((s) => (s === TOTAL_STEPS ? TOTAL_STEPS + 1 : s + 1))}
                  className="gap-1 font-semibold"
                >
                  {step === TOTAL_STEPS ? "Finish" : "Next"} <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
