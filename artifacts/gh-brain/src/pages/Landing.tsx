import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Brain, Scale, ChevronRight, ChevronDown, ChevronUp, AlertTriangle,
  Cpu, Hammer, ClipboardCheck, Users,
  Briefcase, Globe, TrendingUp, Code2, FileText,
  BookOpen, FlaskConical, Search, MessageSquare, Lightbulb, Stethoscope,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import LandingDemoPlayer from "@/components/LandingDemoPlayer";
import { useTemplates } from "@/hooks/useConfiguration";
import { templatePagePath } from "@/data/templatePages";
import { LandingPricing } from "@/components/LandingPricing";
import { usePublicConfig } from "@/hooks/usePublicConfig";

const TEMPLATE_ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Globe, TrendingUp, Code2, FileText, Scale,
  BookOpen, FlaskConical, Search, Stethoscope, Lightbulb,
};

// ── How it works ─────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  { step: "01", title: "Orchestrator — frames your question",
    desc: "Starts with your question, context, and chosen settings. Asks for essential missing information when needed, then opens the discussion." },
  { step: "02", title: "Litigants — examine different positions",
    desc: "The selected AI panel debates the question, challenges assumptions, and examines competing answers within your round and credit limits." },
  { step: "03", title: "Moderator — brings the reasoning together",
    desc: "Collects agreement, disagreement, and limitations. Routes a direct answer to the Auditor, or sends work that needs a deliverable to the Architect and Builder." },
  { step: "04", title: "Architect — plans the deliverable",
    desc: "When a deliverable is needed, defines what to build, its structure, and the requirements it must meet." },
  { step: "05", title: "Builder — produces the work",
    desc: "Builds from the Architect's plan. The Architect checks it against that plan and requests corrections before the Auditor reviews it." },
  { step: "06", title: "Auditor — checks the result",
    desc: "Reviews the answer or deliverable for completeness, support, and limitations. Approves it, requests revisions, or identifies information still needed." },
  { step: "07", title: "Orchestrator — returns the result to you",
    desc: "Explains the result and its review status, presents any deliverable, and brings unresolved questions back to you." },
];

// ── Court seats ───────────────────────────────────────────────────────────────
const COURT_SEATS = [
  {
    id: "orchestrator",
    label: "Orchestrator",
    icon: Brain,
    color: "text-yellow-400",
    desc: "Speaks directly to you. Frames the question, routes it into the courtroom, delivers the verdict, and asks if you want to keep a copy.",
  },
  {
    id: "moderator",
    label: "Moderator",
    icon: Scale,
    color: "text-blue-400",
    desc: "Controls courtroom flow. Collects the debate, identifies consensus and disagreement, briefs the Architect on what to build.",
  },
  {
    id: "litigants",
    label: "Litigants",
    icon: Users,
    color: "text-green-400",
    desc: "The debaters. Add as many as you want — each holds a distinct position, each powered by the AI you assign. Use the +/− control to set the panel size before the trial starts.",
  },
  {
    id: "architect",
    label: "Architect",
    icon: Cpu,
    color: "text-purple-400",
    desc: "Reads the deliberation and designs the deliverable. Decides whether this question needs a brief, a memo, a checklist, or a risk matrix.",
  },
  {
    id: "builder",
    label: "Builder",
    icon: Hammer,
    color: "text-orange-400",
    desc: "Executes the Architect's blueprint. Produces the actual document — complete, formatted, and ready to hand to someone.",
  },
  {
    id: "auditor",
    label: "Auditor",
    icon: ClipboardCheck,
    color: "text-red-400",
    desc: "Nothing leaves without sign-off. Checks the artifact against the blueprint, verifies claims, adds caveats, and either approves or sends it back.",
  },
];

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "I used it to stress-test our Series A pitch before the investor meeting. The Skeptic found a hole in our unit economics that we'd missed for six months.",
    name: "Founder, B2B SaaS",
    role: "Series A",
  },
  {
    quote: "I put a contract clause on trial before signing. The Architect built a risk memo I could actually send to our legal team. Saved me $800 in billable hours.",
    name: "Operations Lead",
    role: "Mid-size logistics firm",
  },
];


// ── Accordion components ──────────────────────────────────────────────────────
const AI_LABELS = [
  { name: "GPT-5",            color: "#10a37f" },
  { name: "Claude Opus 4.5",  color: "#d97757" },
  { name: "GPT-4o",           color: "#10a37f" },
  { name: "Gemini 2.5 Pro",   color: "#4285f4" },
  { name: "o3",               color: "#10a37f" },
  { name: "Claude Sonnet 4.5",color: "#d97757" },
  { name: "Grok 3",           color: "#e5e7eb" },
  { name: "Gemini 2.5 Flash", color: "#4285f4" },
];

function AINameRotator() {
  const [label, setLabel] = useState<{ name: string; color: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Slow → fast → slow slot-machine sequence (ms between each name swap)
    const delays = [700, 520, 370, 240, 150, 95, 68, 52, 48, 52, 68, 95, 150, 240, 370, 520, 700];
    let timeoutId: ReturnType<typeof setTimeout>;
    let step = 0;
    let labelIdx = 0;

    function tick() {
      if (step >= delays.length) {
        setDone(true);
        return;
      }
      setLabel(AI_LABELS[labelIdx % AI_LABELS.length]);
      labelIdx++;
      step++;
      timeoutId = setTimeout(tick, delays[step - 1]);
    }

    timeoutId = setTimeout(tick, 800);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <span style={{ display: "inline-block", verticalAlign: "bottom", width: "6.5em", overflow: "hidden", whiteSpace: "nowrap" }}>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.span
            key="ai-final"
            initial={{ scale: 0.55, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ display: "inline-block", color: "hsl(38 92% 50%)" }}
          >
            AI
          </motion.span>
        ) : label ? (
          <motion.span
            key="reel"
            exit={{ opacity: 0, scale: 0.75 }}
            transition={{ duration: 0.18 }}
            style={{ display: "inline-block", color: label.color }}
          >
            {label.name}
          </motion.span>
        ) : (
          <motion.span key="blank" style={{ display: "inline-block", opacity: 0 }}>AI</motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function HowItWorksRow({
  step, open, onToggle,
}: {
  step: typeof HOW_IT_WORKS[0];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/[0.07]">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 sm:gap-6 py-5 text-left group"
      >
        <span className="text-xs font-mono text-zinc-600 w-6 shrink-0 select-none">{step.step}</span>
        <span className="flex-1 text-sm font-medium text-white group-hover:text-white/70 transition-colors">
          {step.title}
        </span>
        {open
          ? <ChevronUp className="w-5 h-5 text-[#39f70a] shrink-0" />
          : <ChevronDown className="w-5 h-5 text-[#39f70a]/60 shrink-0 animate-pulse" />}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <p className="pb-5 pl-12 text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
        </motion.div>
      )}
    </div>
  );
}

function BenchRow({
  seat, open, onToggle,
}: {
  seat: typeof COURT_SEATS[0];
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = seat.icon;
  return (
    <div className="border-b border-white/[0.07]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 py-5 text-left group"
      >
        <Icon className={cn("w-4 h-4 shrink-0", seat.color)} />
        <span className="flex-1 text-sm font-medium text-white group-hover:text-white/70 transition-colors">
          {seat.label}
        </span>
        {open
          ? <ChevronUp className="w-5 h-5 text-[#39f70a] shrink-0" />
          : <ChevronDown className="w-5 h-5 text-[#39f70a]/60 shrink-0 animate-pulse" />}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <p className="pb-5 pl-8 text-sm text-zinc-500 leading-relaxed">{seat.desc}</p>
        </motion.div>
      )}
    </div>
  );
}


// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { data: templates = [] } = useTemplates();
  const { user, loading } = useAuth();
  const isSignedIn = !loading && !!user;
  const { signupBonusCredits: signupBonus } = usePublicConfig();
  const [openPanel, setOpenPanel] = useState<number | null>(null);
  const [openHIW, setOpenHIW] = useState<number | null>(null);
  const [openBench, setOpenBench] = useState<number | null>(null);
  const [openTemplate, setOpenTemplate] = useState<number>(0);

  function openBrainFlow() {
    setOpenPanel(1);
    setOpenHIW(0);
    requestAnimationFrame(() => document.getElementById("the-bench")?.scrollIntoView({ block: "start" }));
  }
  useEffect(() => {
    const followHash = () => { if (window.location.hash === "#the-bench") openBrainFlow(); };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);

  return (
    <div>

      {/* ── Navbar (shared SiteHeader — edit SiteHeader.tsx to update everywhere) ── */}
      <SiteHeader variant="landing" onSectionNavigate={href => { if (href === "/#the-bench") openBrainFlow(); }} />

      <main>

        {/* ── 1. Hero ── */}
        <section className="hero">
            <div className="row">
            <div className="layout__split-2-1">
            <div className="hero-text">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="font-['Playfair_Display'] text-3xl lg:text-6xl font-semibold text-white leading-[1.08] mb-3">
                Put <AINameRotator /><br />to the question!
              </h1>
              <p className="text-base font-semibold mb-8 tracking-wide" style={{color:'hsl(38 92% 50% / 0.75)'}}>
                Every great decision deserves a trial.
              </p>
              <p className="text-base text-zinc-400 mb-10 max-w-xl leading-relaxed">
                State your case to the litigants. Have them argue the point — or build the answer together. You're the boss. You decide.
              </p>
              <div className="btn-row center">
                <Link href={isSignedIn ? "/session" : "/register"}>
                  <button className="btn btn--cta">
                    {isSignedIn ? "Enter the Court" : signupBonus === null ? "Start Free" : `Start Free — ${signupBonus} credits`}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
            </motion.div>
            </div>{/* /hero-text */}
            <div className="hero-img-col">
              <img
                src="/hero-courtroom.png"
                alt="Full courtroom scene — Litigant AI"
              />
            </div>
            </div>{/* /layout__split-2-1 */}
            </div>{/* /row */}
        </section>

        {/* ── 2–4. Three-panel accordion ── */}
        <section id="how-it-works" className="section border-t border-white/[0.06]">
            <div className="row">
              <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3 uppercase">Inside the Courtroom</p>
              <h2 className="font-['Playfair_Display'] text-3xl font-semibold text-white">
                How Litigant AI Works
              </h2>
            </div>

            <div className="row">
            <div className="layout__split-2-1">

            {/* ── Left: accordion panels ── */}
            <div>
            {/* Panel 1 — Court Architecture */}
            <div className="border-t border-white/[0.07]">
              <button
                onClick={() => setOpenPanel(openPanel === 0 ? null : 0)}
                className="w-full flex items-center gap-6 py-6 text-left group"
              >
                <span className="text-xs font-mono text-amber-500/50 tracking-widest w-6 shrink-0 select-none">01</span>
                <div className="flex-1">
                  <span className={`block text-base font-semibold font-['Playfair_Display'] transition-colors ${openPanel === 0 ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                    Court Architecture
                  </span>
                  <span className="text-xs text-zinc-600 mt-0.5 block">Six specialized seats. What you control before a trial starts.</span>
                </div>
                {openPanel === 0
                  ? <ChevronUp className="w-5 h-5 text-[#39f70a] shrink-0" />
                  : <ChevronDown className="w-5 h-5 text-[#39f70a]/60 shrink-0 animate-pulse" />}
              </button>
              {openPanel === 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-8 pl-12">
                    <p className="text-zinc-500 text-sm mb-6 max-w-lg leading-relaxed">
                      Every seat has a defined role and brief. Admin assigns which AI model sits in each one — GPT-4o as Architect, Claude as Builder, Grok as Skeptic. You set panel size with the +/− control before the trial begins.
                    </p>
                    <div className="border-t border-white/[0.07]">
                      {COURT_SEATS.map((seat, i) => (
                        <BenchRow
                          key={seat.id}
                          seat={seat}
                          open={openBench === i}
                          onToggle={() => setOpenBench(openBench === i ? null : i)}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Panel 2 — The Bench: existing Brain flow */}
            <div id="the-bench" className="border-t border-white/[0.07] scroll-mt-20">
              <button
                aria-expanded={openPanel === 1}
                aria-controls="brain-flow"
                onClick={() => setOpenPanel(openPanel === 1 ? null : 1)}
                className="w-full flex items-center gap-6 py-6 text-left group"
              >
                <span className="text-xs font-mono text-amber-500/50 tracking-widest w-6 shrink-0 select-none">02</span>
                <div className="flex-1">
                  <span className={`block text-base font-semibold font-['Playfair_Display'] transition-colors ${openPanel === 1 ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                    The Bench
                  </span>
                  <span className="text-xs text-zinc-600 mt-0.5 block">From Orchestrator through the Brain and back to you.</span>
                </div>
                {openPanel === 1
                  ? <ChevronUp className="w-5 h-5 text-[#39f70a] shrink-0" />
                  : <ChevronDown className="w-5 h-5 text-[#39f70a]/60 shrink-0 animate-pulse" />}
              </button>
              {openPanel === 1 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div id="brain-flow" className="pb-8 pl-4 sm:pl-12">
                    <p className="text-zinc-400 text-sm mb-6 max-w-lg leading-relaxed">
                      The Orchestrator opens and closes the process. The Brain debates, combines the reasoning, builds when needed, and reviews the result before returning it to you.
                    </p>
                    <div className="border-t border-white/[0.07]">
                      {HOW_IT_WORKS.map((step, i) => (
                        <HowItWorksRow
                          key={i}
                          step={step}
                          open={openHIW === i}
                          onToggle={() => setOpenHIW(openHIW === i ? null : i)}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Panel 3 — The Docket */}
            <div className="border-t border-white/[0.07]">
              <button
                onClick={() => setOpenPanel(openPanel === 2 ? null : 2)}
                className="w-full flex items-center gap-6 py-6 text-left group"
              >
                <span className="text-xs font-mono text-amber-500/50 tracking-widest w-6 shrink-0 select-none">03</span>
                <div className="flex-1">
                  <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-1 uppercase">The Docket</p>
                  <span className={`block text-base font-semibold font-['Playfair_Display'] transition-colors ${openPanel === 2 ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                    Start From a Template
                  </span>
                  <span className="text-xs text-zinc-600 mt-0.5 block">Pro only · Choose a template and make it your own.</span>
                </div>
                {openPanel === 2
                  ? <ChevronUp className="w-5 h-5 text-[#39f70a] shrink-0" />
                  : <ChevronDown className="w-5 h-5 text-[#39f70a]/60 shrink-0 animate-pulse" />}
              </button>
              {openPanel === 2 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-6 pl-12">
                    <div className="flex flex-col">
                      {templates.map((t, i) => {
                        const Icon = TEMPLATE_ICON_MAP[t.icon] || Scale;
                        const isOpen = openTemplate === i;
                        return (
                          <div key={t.id} className="border-t border-white/[0.06] first:border-t-0">
                            <button
                              onClick={() => setOpenTemplate(isOpen ? -1 : i)}
                              className="w-full flex items-center gap-3 py-2.5 text-left group/t"
                            >
                              <Icon className="w-3.5 h-3.5 text-amber-500/50 shrink-0" />
                              <span className={`flex-1 text-xs font-medium transition-colors ${isOpen ? "text-white" : "text-zinc-400 group-hover/t:text-zinc-200"}`}>
                                {t.title}
                              </span>
                              <span className="text-[10px] text-zinc-700 tabular-nums shrink-0">View template</span>
                              {isOpen
                                ? <ChevronUp className="w-4 h-4 text-[#39f70a] shrink-0" />
                                : <ChevronDown className="w-4 h-4 text-[#39f70a]/50 shrink-0 animate-pulse" />}
                            </button>
                            {isOpen && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <p className="text-[11px] text-zinc-500 leading-relaxed pb-3 pl-[1.625rem]">{t.description}</p>
                                <Link href={templatePagePath(t.id)} className="text-xs text-primary inline-block pb-3 pl-[1.625rem]">View template →</Link>
                              </motion.div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            </div>{/* /left accordion col */}

            {/* ── Right: live demo player ── */}
            <div className="hero-img-col relative overflow-hidden">
              <LandingDemoPlayer />
            </div>{/* /right visual col */}

            </div>{/* /layout__split-2-1 */}
            </div>{/* /row — accordion + visual */}

        </section>

        <LandingPricing isSignedIn={isSignedIn} signupBonus={signupBonus} />

        {/* ── 9. In the Field ── */}
        <section id="in-the-field" className="section border-t border-white/[0.06]">
            <div className="row"><div className="max-w-3xl">
              <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3 uppercase">In the Field</p>
              <h2 className="font-['Playfair_Display'] text-3xl font-semibold text-white">What practitioners say</h2>
            </div></div>
            <div className="row">
            <div className="layout__split-2">
              {TESTIMONIALS.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="border-l-2 border-white/[0.08] pl-6"
                >
                  <p className="text-zinc-300 text-sm leading-relaxed mb-5">"{t.quote}"</p>
                  <div className="text-white text-xs font-medium">{t.name}</div>
                  <div className="text-zinc-600 text-xs font-mono mt-0.5">{t.role}</div>
                </motion.div>
              ))}
            </div>
            </div>
        </section>

        {/* ── 10. CTA ── */}
        <section className="section border-t border-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-white/[0.02] to-transparent pointer-events-none" />
            <div className="row relative z-10 text-center">
            <div className="inline-flex items-start gap-3 p-4 border border-amber-500/20 bg-amber-500/[0.04] text-left text-xs text-amber-500/60 max-w-xl mx-auto">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500/50" />
              <span>
                Litigant AI outputs are{" "}
                <strong className="text-amber-400/80">not legal, medical, financial, or professional advice</strong>.
                Always apply human judgment before acting on any output.
              </span>
            </div>
            </div>{/* /row — disclaimer */}
            <div className="row">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-['Playfair_Display'] text-4xl lg:text-5xl font-semibold text-white mb-4">
                Ready to convene the court?
              </h2>
              <p className="text-zinc-500 mb-10 text-sm">
                {signupBonus === null ? "Start free. No credit card required." : `Start free. No credit card required. Your first ${signupBonus} credits are on us.`}
              </p>
              <div className="btn-row btn-row--center">
                <Link href={isSignedIn ? "/session" : "/register"}>
                  <button className="btn btn--cta btn--lg">
                    {isSignedIn ? "Enter the Court" : signupBonus === null ? "Start Free" : `Start Free — ${signupBonus} credits included`}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
                {!isSignedIn && (
                  <Link href="/sign-in">
                    <button
                      className="btn btn--green-out btn--lg"
                    >
                      Sign In
                    </button>
                  </Link>
                )}
              </div>
            </motion.div>
            </div>{/* /row — CTA motion */}
        </section>

      </main>

      {/* Shared footer — edit SiteFooter.tsx to update everywhere */}
      <SiteFooter variant="landing" />

    </div>
  );
}
