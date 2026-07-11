import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Brain, Scale, ChevronRight, ChevronDown, ChevronUp, AlertTriangle,
  Cpu, Hammer, ClipboardCheck, Users,
  Briefcase, Globe, TrendingUp, Code2, FileText,
  BookOpen, FlaskConical, Search, MessageSquare, Lightbulb,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import LandingDemoPlayer from "@/components/LandingDemoPlayer";
import { TOOL_PAGES } from "@/data/toolPages";

const TOOL_ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Globe, TrendingUp, Code2, FileText, Scale,
  BookOpen, FlaskConical, Search, MessageSquare, Lightbulb,
};

// ── How it works ─────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "01",
    title: "You Submit the Question",
    desc: "Put any contested claim, decision, or hypothesis on trial. Free-form — no template required. The Orchestrator frames it and opens the courtroom.",
  },
  {
    step: "02",
    title: "Litigants Debate",
    desc: "A panel of AI models argue the question in real time — each holding a distinct position. Add as many as you want using the +/− control. The larger the panel, the sharper the cross-examination.",
  },
  {
    step: "03",
    title: "Moderator Collects",
    desc: "The Moderator synthesises the debate: what was agreed, what was contested, what was the strongest argument on each side.",
  },
  {
    step: "04",
    title: "Architect Designs the Output",
    desc: "The Architect reads the deliberation and decides what gets built — a legal brief, a decision memo, a risk matrix — whatever the question actually calls for.",
  },
  {
    step: "05",
    title: "Builder Produces It",
    desc: "The Builder constructs the artifact to spec. A production-ready document the Auditor then quality-checks before release.",
  },
  {
    step: "06",
    title: "Verdict Delivered",
    desc: "The Orchestrator returns a direct answer plus the built artifact. You challenge it — the court responds. Loop continues until you're satisfied or credits run out.",
  },
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

// ── Pricing tiers ─────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Trial",
    price: "Free",
    credits: "100 credits on signup",
    badge: null,
    highlight: false,
    features: [
      "100 credits — no card required",
      "Full access to the courtroom",
      "All AI models available",
      "Export to Markdown",
      "Complete session history",
    ],
  },
  {
    name: "Starter",
    price: "$4.99",
    credits: "500 credits",
    badge: null,
    highlight: false,
    features: [
      "500 credits, never expire",
      "~12–33 full sessions",
      "All export formats",
      "Complete session history",
      "Auto top-up available",
    ],
  },
  {
    name: "Pro Pack",
    price: "$19.99",
    credits: "2,200 credits",
    badge: "Best Value",
    highlight: true,
    features: [
      "2,200 credits (+10% bonus)",
      "~55–146 full sessions",
      "All export formats",
      "Complete session history",
      "Auto top-up available",
    ],
  },
  {
    name: "Mega Pack",
    price: "$34.99",
    credits: "4,200 credits",
    badge: "+20% bonus",
    highlight: false,
    features: [
      "4,200 credits (+20% bonus)",
      "~105–280 full sessions",
      "All export formats",
      "Complete session history",
      "Auto top-up available",
    ],
  },
];

// ── Accordion components ──────────────────────────────────────────────────────
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
        className="w-full flex items-center gap-6 py-5 text-left group"
      >
        <span className="text-xs font-mono text-zinc-600 w-6 shrink-0 select-none">{step.step}</span>
        <span className="flex-1 text-sm font-medium text-white group-hover:text-white/70 transition-colors">
          {step.title}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-zinc-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
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
          ? <ChevronUp className="w-4 h-4 text-zinc-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
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

function ToolRow({
  tool, open, onToggle,
}: {
  tool: typeof TOOL_PAGES[0];
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = TOOL_ICON_MAP[tool.icon] ?? Briefcase;
  return (
    <div className="border-b border-white/[0.07]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 py-5 text-left group"
      >
        <Icon className="w-4 h-4 shrink-0 text-zinc-600 group-hover:text-white transition-colors" />
        <span className="flex-1 text-sm font-medium text-white group-hover:text-white/70 transition-colors">
          {tool.title}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-zinc-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <div className="pb-5 pl-8 flex items-start justify-between gap-6">
            <p className="text-sm text-zinc-500 leading-relaxed">{tool.metaDescription}</p>
            <Link href={`/tools/${tool.slug}`} className="shrink-0 text-xs font-mono text-white/40 hover:text-white transition-colors whitespace-nowrap">
              Try it →
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user, loading } = useAuth();
  const isSignedIn = !loading && !!user;
  const [openPanel, setOpenPanel] = useState<number | null>(null);
  const [openHIW, setOpenHIW] = useState<number | null>(null);
  const [openBench, setOpenBench] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [openTool, setOpenTool] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#080808] text-white selection:bg-white/10">

      {/* ── Navbar (shared SiteHeader — edit SiteHeader.tsx to update everywhere) ── */}
      <SiteHeader variant="landing" />

      <main className="main">

        {/* ── 1. Hero ── */}
        <section className="hero">
          <div className="lgt-container">
            <div className="row">
            <div className="layout__split-2-1">
            <div className="hero-text">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="font-['Playfair_Display'] text-5xl lg:text-7xl font-semibold text-white leading-[1.08] mb-4">
                Every great decision<br />deserves a trial.
              </h1>
              <p className="text-base font-semibold mb-8 tracking-wide">
                Put <em style={{color:'hsl(108 94% 50%)'}}>it</em>{" "}
                <span className="text-white">to the</span>{" "}
                <span style={{color:'hsl(38 92% 50%)'}}>question!</span>
              </p>
              <p className="text-base text-zinc-400 mb-10 max-w-xl leading-relaxed">
                Put your toughest questions before a panel of AI models that genuinely disagree. Watch them argue, cross-examine, and deliver a confidence-scored verdict you can actually trust.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={isSignedIn ? "/session" : "/register"}>
                  <button
                    className="h-11 px-7 text-sm font-bold tracking-wide transition-all inline-flex items-center gap-2"
                    style={{background:'hsl(38 92% 50%)', color:'#000'}}
                  >
                    {isSignedIn ? "Open App" : "Start Free — 100 credits"}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
                <a href="#how-it-works">
                  <button
                    className="h-11 px-7 text-sm font-medium transition-colors border"
                    style={{borderColor:'hsl(108 94% 50% / 0.35)', color:'hsl(108 94% 50%)'}}
                  >
                    Read the Protocol
                  </button>
                </a>
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
          </div>
        </section>

        {/* ── 2–4. Three-panel accordion ── */}
        <section id="how-it-works" className="section border-t border-white/[0.06]">
          <div className="lgt-container">
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
                  ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
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

            {/* Panel 2 — Trial Protocol */}
            <div className="border-t border-white/[0.07]">
              <button
                onClick={() => setOpenPanel(openPanel === 1 ? null : 1)}
                className="w-full flex items-center gap-6 py-6 text-left group"
              >
                <span className="text-xs font-mono text-amber-500/50 tracking-widest w-6 shrink-0 select-none">02</span>
                <div className="flex-1">
                  <span className={`block text-base font-semibold font-['Playfair_Display'] transition-colors ${openPanel === 1 ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                    Trial Protocol
                  </span>
                  <span className="text-xs text-zinc-600 mt-0.5 block">From question to verdict — six deliberate steps.</span>
                </div>
                {openPanel === 1
                  ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
              </button>
              {openPanel === 1 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-8 pl-12">
                    <p className="text-zinc-500 text-sm mb-6 max-w-lg leading-relaxed">
                      Not a chatbot. A structured pipeline of specialised AI seats — each with a defined job, in a defined order.
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

            {/* Panel 3 — Watch the Court */}
            <div className="border-t border-white/[0.07]">
              <button
                onClick={() => setOpenPanel(openPanel === 2 ? null : 2)}
                className="w-full flex items-center gap-6 py-6 text-left group"
              >
                <span className="text-xs font-mono text-amber-500/50 tracking-widest w-6 shrink-0 select-none">03</span>
                <div className="flex-1">
                  <span className={`block text-base font-semibold font-['Playfair_Display'] transition-colors ${openPanel === 2 ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                    Watch the Court
                  </span>
                  <span className="text-xs text-zinc-600 mt-0.5 block">Pre-scripted replay — exactly what you'll see on your first trial.</span>
                </div>
                {openPanel === 2
                  ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
              </button>
              {openPanel === 2 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-8">
                    <LandingDemoPlayer />
                  </div>
                </motion.div>
              )}
            </div>
            </div>{/* /left accordion col */}

            {/* ── Right: trial flow visual ── */}
            <div className="hero-img-col flex-col gap-0 pt-0" style={{alignItems:"stretch"}}>
              <div className="border border-white/[0.08] rounded-lg overflow-hidden" style={{background:"#0a0a0a"}}>
                <div className="px-5 py-4 border-b border-white/[0.06]">
                  <p className="text-xs font-mono text-amber-500/60 tracking-widest uppercase">Trial Flow</p>
                </div>
                {[
                  { n:"01", label:"Submit Question", sub:"State your decision, dilemma, or dispute", color:"hsl(108 94% 50%)" },
                  { n:"02", label:"Panel Convenes", sub:"AI seats take their assigned roles and briefs", color:"hsl(38 92% 50%)" },
                  { n:"03", label:"Structured Debate", sub:"Each seat argues, cross-examines, and rebuts", color:"hsl(108 94% 50%)" },
                  { n:"04", label:"Verdict Delivered", sub:"Confidence-scored conclusion with full transcript", color:"hsl(38 92% 50%)" },
                ].map((step, i, arr) => (
                  <div key={i} className="relative">
                    <div className="flex items-start gap-4 px-5 py-5">
                      <div className="shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs font-mono font-bold mt-0.5"
                        style={{borderColor: step.color + "44", color: step.color, background: step.color + "11"}}>
                        {step.n}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white mb-0.5">{step.label}</p>
                        <p className="text-xs text-zinc-500 leading-relaxed">{step.sub}</p>
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="absolute left-[2.1rem] top-[3.5rem] w-px h-4" style={{background:"linear-gradient(to bottom, hsl(108 94% 50% / 0.2), transparent)"}} />
                    )}
                  </div>
                ))}
                <div className="px-5 py-4 border-t border-white/[0.06]" style={{background:"hsl(108 94% 50% / 0.04)"}}>
                  <p className="text-xs text-zinc-600 leading-relaxed">Credits deducted only after verdict. Cancel any time.</p>
                </div>
              </div>
            </div>{/* /right visual col */}

            </div>{/* /layout__split-2-1 */}
            </div>{/* /row — accordion + visual */}

          </div>
        </section>

        {/* ── 7. Pricing ── */}
        <section id="pricing" className="section border-t border-white/[0.06]">
          <div className="lgt-container">
            <div className="row"><div className="max-w-3xl">
              <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3 uppercase">Docket</p>
              <h2 className="font-['Playfair_Display'] text-3xl font-semibold text-white">Open a Case</h2>
              <p className="text-zinc-500 mt-3 text-sm">
                Credits never expire. No subscriptions, no seat fees — pay for what you use.
              </p>
            </div></div>{/* /row — pricing heading */}
            <div className="row">
            <div className="layout__split-4">
              {PLANS.map((plan, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className={cn(
                    "border p-6 flex flex-col relative",
                    plan.highlight
                      ? "border-white/20 bg-white/[0.04]"
                      : "border-white/[0.08] bg-transparent"
                  )}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-4 px-2 py-0.5 bg-amber-500/[0.15] border border-amber-500/30 text-amber-400 text-[10px] font-mono uppercase tracking-widest">
                      {plan.badge}
                    </div>
                  )}
                  <div className="mb-4">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">{plan.name}</div>
                    <div className="text-3xl font-bold text-white">{plan.price}</div>
                    <div className="text-xs text-zinc-500 font-mono mt-1">{plan.credits}</div>
                  </div>
                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map((f, j) => (
                      <li key={j} className="text-xs text-zinc-500 flex items-start gap-1.5">
                        <span className="text-white/25 mt-0.5 shrink-0">·</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={isSignedIn ? "/billing" : "/register"}>
                    <button className={cn(
                      "w-full h-9 text-xs font-medium transition-colors",
                      plan.highlight
                        ? "bg-white text-black hover:bg-white/90"
                        : "border border-white/[0.15] text-white hover:border-white/30"
                    )}>
                      {plan.name === "Trial"
                        ? (isSignedIn ? "Go to Billing" : "Start Free")
                        : (isSignedIn ? "Buy Credits" : "Get Started")}
                    </button>
                  </Link>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-xs text-zinc-600 font-mono mt-8">
              100 credits = $1.00 · Credits never expire · Auto top-up available · Cancel anytime
            </p>
            </div>{/* /row — pricing grid */}

          </div>
        </section>

        {/* ── 8. Tools / Docket ── */}
        <section id="tools" className="section border-t border-white/[0.06] bg-[#060606]">
          <div className="lgt-container">
            <div className="row">
            <div className="border-t border-white/[0.07]">
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                className="w-full flex items-center gap-6 py-6 text-left group"
              >
                <span className="text-xs font-mono text-amber-500/50 tracking-widest w-6 shrink-0 select-none">⚖</span>
                <div className="flex-1">
                  <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-1 uppercase">The Docket</p>
                  <span className={`block text-base font-semibold font-['Playfair_Display'] transition-colors ${toolsOpen ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                    Put It to the Question.
                  </span>
                  <span className="text-xs text-zinc-600 mt-0.5 block">14 purpose-built tools — each one a full AI courtroom for a specific domain.</span>
                </div>
                {toolsOpen
                  ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
              </button>
              {toolsOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-8 pl-12 border-t border-white/[0.07]">
                    {TOOL_PAGES.map((tool, i) => (
                      <ToolRow
                        key={tool.slug}
                        tool={tool}
                        open={openTool === i}
                        onToggle={() => setOpenTool(openTool === i ? null : i)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
            </div>{/* /row — tools accordion */}
          </div>
        </section>

        {/* ── 9. In the Field ── */}
        <section id="in-the-field" className="section border-t border-white/[0.06]">
          <div className="lgt-container">
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
          </div>
        </section>

        {/* ── 10. CTA ── */}
        <section className="section border-t border-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-white/[0.02] to-transparent pointer-events-none" />
          <div className="lgt-container relative z-10 text-center">
            <div className="row">
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
                Start free. No credit card required. Your first 100 credits are on us.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href={isSignedIn ? "/session" : "/register"}>
                  <button
                    className="h-12 px-10 text-sm font-bold uppercase tracking-wide transition-all inline-flex items-center gap-2"
                    style={{background:'hsl(38 92% 50%)', color:'#000'}}
                  >
                    {isSignedIn ? "Open App" : "Start Free — 100 credits included"}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
                {!isSignedIn && (
                  <Link href="/sign-in">
                    <button
                      className="h-12 px-8 text-sm font-medium transition-colors border"
                      style={{borderColor:'hsl(108 94% 50% / 0.35)', color:'hsl(108 94% 50%)'}}
                    >
                      Sign In
                    </button>
                  </Link>
                )}
              </div>
            </motion.div>
            </div>{/* /row — CTA motion */}
          </div>
        </section>

      </main>

      {/* Shared footer — edit SiteFooter.tsx to update everywhere */}
      <SiteFooter variant="landing" />

    </div>
  );
}
