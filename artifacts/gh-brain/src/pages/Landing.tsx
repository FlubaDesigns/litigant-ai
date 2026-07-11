import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Brain, Gavel, Scale, Crosshair, ChevronRight, Zap, Shield,
  FileText, BarChart3, Code2, BookOpen, Lightbulb, Search,
  Briefcase, FlaskConical, Newspaper, Vote, TrendingUp, Globe,
  MessageSquare, Lock, ChevronDown, ChevronUp, AlertTriangle,
  User, Cpu, Hammer, ClipboardCheck, Users, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

import clashImage from "@/assets/images/hero-clash.png";
import neuralImage from "@/assets/images/neural-court.png";
import LandingDemoPlayer from "@/components/LandingDemoPlayer";
import { TOOL_PAGES } from "@/data/toolPages";

// ── Tool page icon map ────────────────────────────────────────────────────────
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
    border: "border-yellow-400/30",
    bg: "bg-yellow-400/5",
    desc: "Speaks directly to you. Frames the question, routes it into the courtroom, delivers the verdict, and asks if you want to keep a copy.",
  },
  {
    id: "moderator",
    label: "Moderator",
    icon: Scale,
    color: "text-blue-400",
    border: "border-blue-400/30",
    bg: "bg-blue-400/5",
    desc: "Controls courtroom flow. Collects the debate, identifies consensus and disagreement, briefs the Architect on what to build.",
  },
  {
    id: "litigants",
    label: "Litigants",
    icon: Users,
    color: "text-primary",
    border: "border-primary/30",
    bg: "bg-primary/5",
    desc: "The debaters. Add as many as you want — each holds a distinct position, each powered by the AI you assign. Use the +/− control to set the panel size before the trial starts.",
  },
  {
    id: "architect",
    label: "Architect",
    icon: Cpu,
    color: "text-purple-400",
    border: "border-purple-400/30",
    bg: "bg-purple-400/5",
    desc: "Reads the deliberation and designs the deliverable. Decides whether this question needs a brief, a memo, a checklist, or a risk matrix.",
  },
  {
    id: "builder",
    label: "Builder",
    icon: Hammer,
    color: "text-orange-400",
    border: "border-orange-400/30",
    bg: "bg-orange-400/5",
    desc: "Executes the Architect's blueprint. Produces the actual document — complete, formatted, and ready to hand to someone.",
  },
  {
    id: "auditor",
    label: "Auditor",
    icon: ClipboardCheck,
    color: "text-green-400",
    border: "border-green-400/30",
    bg: "bg-green-400/5",
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
  {
    quote: "Asked whether our go-to-market strategy was sound. Challenged the verdict twice. By the third round, we had a completely different — and much sharper — positioning.",
    name: "CMO",
    role: "E-commerce brand",
  },
];

// ── Pricing tiers ─────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Trial",
    price: "Free",
    period: "",
    credits: "100 credits on signup",
    badge: null,
    highlight: false,
    cta: "Start Free",
    features: [
      "100 credits included — no card required",
      "Full access to the courtroom",
      "All AI models available",
      "Export to Markdown",
      "Complete session history",
    ],
  },
  {
    name: "Starter",
    price: "$4.99",
    period: "",
    credits: "500 credits",
    badge: null,
    highlight: false,
    cta: "Buy Credits",
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
    period: "",
    credits: "2,200 credits",
    badge: "Best Value",
    highlight: true,
    cta: "Buy Credits",
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
    period: "",
    credits: "4,200 credits",
    badge: "+20% bonus",
    highlight: false,
    cta: "Buy Credits",
    features: [
      "4,200 credits (+20% bonus)",
      "~105–280 full sessions",
      "All export formats",
      "Complete session history",
      "Auto top-up available",
    ],
  },
];

// ── FAQ data ─────────────────────────────────────────────────────────────────
const FAQ = [
  {
    q: "What exactly is a 'credit'?",
    a: "One credit equals roughly 1,000 tokens consumed across all AI seats in a session. A full trial — Litigants debating, Moderator synthesising, Architect + Builder producing an artifact, Auditor reviewing — typically uses 15–40 credits depending on depth and model choice.",
  },
  {
    q: "Which AI models are available?",
    a: "The admin connects providers — GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Grok, and others. Each seat can be assigned a different model. You pick from what's been connected. Any OpenAI-compatible model can be unlocked by connecting its provider in the admin panel.",
  },
  {
    q: "What does the court actually produce?",
    a: "Two things: a direct verdict answer, and an artifact — a built document the Architect designed and the Builder produced specifically for your question. Depending on the question, that might be a decision memo, a risk matrix, a legal brief outline, a project checklist, or a structured report. The Auditor reviews it before you see it.",
  },
  {
    q: "What is the rebuttal loop?",
    a: "After the Orchestrator delivers the verdict, you can challenge it. Tell the court what it got wrong or missed — the court reconvenes specifically to address your challenge, not to re-run the entire trial. You keep challenging until you're satisfied or your credit limit is hit.",
  },
  {
    q: "How is this different from asking ChatGPT to 'play devil's advocate'?",
    a: "A single model playing multiple roles still reasons from one perspective. Litigant AI uses independently trained models with different architectures, knowledge cutoffs, and training priors — producing authentic intellectual conflict. The pipeline also goes further: the court doesn't just debate, it builds you a deliverable.",
  },
  {
    q: "Is my data used to train any models?",
    a: "No. All sessions are processed via direct API calls to model providers. Neither your inputs nor the outputs are used for model training by Litigant AI. Sessions are stored encrypted and tied to your account only.",
  },
  {
    q: "Can I share a verdict or export the artifact?",
    a: "Yes. The Orchestrator prompts you to save at the end of each session. Saved sessions go to your case files. Shareable read-only verdict links are on the roadmap — no login required to view them.",
  },
  {
    q: "What is a 'court seat brief'?",
    a: "Each seat is governed by a markdown document that defines its role, responsibilities, tone, and hard constraints. The Architect's brief tells it how to design outputs; the Auditor's brief tells it what quality threshold to enforce. Admin can update any brief at any time — changes take effect within minutes, no redeploy needed.",
  },
];

// ── FAQ Accordion ─────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left gap-4 group"
      >
        <span className="font-medium text-foreground group-hover:text-primary transition-colors">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="pb-5 text-muted-foreground text-sm leading-relaxed"
        >
          {a}
        </motion.div>
      )}
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user, loading } = useAuth();
  const isSignedIn = !loading && !!user;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">

      {/* ── Navbar ── */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="lgt-container h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-90 transition-opacity">
            <img src="/logo.png" alt="Litigant AI" className="h-8 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/session">Open App</Link>
              </Button>
            ) : (
              <>
                <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Sign In
                </Link>
                <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Link href="/register">Start Free</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── 1. Hero ── */}
        <section className="section--hero">
          <div className="absolute inset-0 brain-grid opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/8 rounded-[100%] blur-[140px] pointer-events-none" />

          <div className="lgt-container relative z-10">
            <div className="layout__split-2 items-center">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="max-w-2xl"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono uppercase tracking-wider mb-6">
                  <span className="status-dot" />
                  System Active
                </div>
                <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter mb-6 leading-[1.05]">
                  Don't just ask AI.<br />
                  <span className="text-primary">Put the question on trial.</span>
                </h1>
                <p className="text-xl text-muted-foreground mb-8 font-light max-w-xl leading-relaxed">
                  A high-stakes adversarial reasoning engine for power users who refuse to trust a single AI response. Watch great minds clash in real time.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button asChild size="lg" className="h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground text-base rounded-none">
                    <Link href={isSignedIn ? "/session" : "/register"}>
                      {isSignedIn ? "Open App" : "Start Free"} <ChevronRight className="ml-2 w-5 h-5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="h-14 px-8 border-border hover:bg-secondary text-base rounded-none">
                    <a href="#how-it-works">Read Protocols</a>
                  </Button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, delay: 0.2 }}
                className="relative hidden lg:block"
              >
                <div className="aspect-[4/3] rounded-sm overflow-hidden border border-border/50 shadow-2xl relative">
                  <div className="absolute inset-0 bg-primary/10 mix-blend-overlay z-10" />
                  <img
                    src={clashImage}
                    alt="Adversarial AI courtroom"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-4 -right-4 border border-primary/40 bg-card p-4 rounded-sm font-mono text-xs text-primary shadow-lg">
                  <div className="text-muted-foreground mb-1">// verdict confidence</div>
                  <div className="text-2xl font-bold">87.4%</div>
                  <div className="text-muted-foreground text-[10px] mt-1">3 models · 4 rounds</div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 1b. Live Demo Player ── */}
        <section className="section section--bordered section--demo-glow">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="badge--eyebrow-glow inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-primary border border-primary/30 rounded-full px-4 py-1.5 mb-5">
                  <span className="status-dot" />
                  Live Demo — pre-scripted, no API calls
                </div>
                <h2 className="text-4xl font-bold tracking-tight mb-4">Watch the Court in Session</h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  As many litigants as you want. One question. A verdict you can trust. This is exactly what you'll see when you run your first trial.
                </p>
              </motion.div>
            </div>

            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              >
                <LandingDemoPlayer />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 2. The Briefing Room ── */}
        <section className="section section--alt section--bordered">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-3xl"
              >
                <span className="eyebrow">⚙ Mission Briefing</span>
                <h2 className="text-4xl font-bold tracking-tight mb-4">The Briefing Room</h2>
                <p className="text-lg text-muted-foreground">
                  Before the court convenes, you set the rules. Every session is configured by you — here is exactly what each control does.
                </p>
              </motion.div>
            </div>

            <div className="row">
              <div className="layout__split-2">
                {[
                  {
                    num: "01",
                    label: "Safety Filter",
                    options: ["Conscience ON", "Conscience OFF"],
                    desc: "When ON, each AI model performs a self-check at the end of its response — flagging potential bias, gaps in reasoning, or harmful outputs before they reach you. When OFF, you get the raw, unfiltered output. Most users leave this ON.",
                  },
                  {
                    num: "02",
                    label: "Response Mode",
                    options: ["Consensus Only", "All Voices"],
                    desc: "Consensus Only gives you a single synthesized answer — the court's agreed position. All Voices shows you every litigant's individual response in full, so you can read each model's reasoning and see exactly where they agree or diverge.",
                  },
                  {
                    num: "03",
                    label: "Debate Mode",
                    options: ["Adversarial", "Collaborative"],
                    desc: "Adversarial: the AIs actively challenge and attack each other's positions — designed to find weaknesses and surface contradictions. Collaborative: the AIs build on each other's ideas toward a shared answer. Adversarial is harder on a claim. Collaborative is better for creative or exploratory questions.",
                  },
                  {
                    num: "04",
                    label: "AI Reasoning",
                    options: ["Independent", "Chain"],
                    desc: "Independent: each AI responds only from its own prior reasoning — it never reads the other models' turns. Maximum diversity, lower cost. Chain: each AI reads the full debate transcript before responding — richer cross-examination, but significantly more credits because every model re-reads everything each round.",
                  },
                  {
                    num: "05",
                    label: "Output Strategy",
                    options: ["Moderator Consensus", "Individual Responses", "Consensus + Individual", "Court Transcript", "Artifact Only"],
                    desc: "Controls what the court actually produces. Moderator Consensus is a clean synthesized ruling. Individual Responses gives each model's answer separately. Transcript gives you the full back-and-forth. Artifact Only is for when you just want the downloadable file with no on-screen display.",
                  },
                  {
                    num: "06",
                    label: "Output Preference",
                    options: ["Display in chat", "Download only", "Display + download"],
                    desc: "Where you want the result to appear. Display in chat shows it live as the session runs. Download only saves it as a file without rendering it on screen. Display + download does both.",
                  },
                  {
                    num: "07",
                    label: "Format",
                    options: ["Text", "Markdown", "JSON"],
                    desc: "The file format for your verdict. Text is plain readable output. Markdown is formatted and ready to paste into Notion, GitHub, or any editor that renders it. JSON is structured data — useful if you're piping the output into another tool or system.",
                  },
                  {
                    num: "08",
                    label: "Confidence Target",
                    options: ["80% Fast", "90% Standard", "95% Deep", "99% Maximum"],
                    desc: "The threshold the court must reach before it can deliver a verdict. 80% is fast and cheap — good for quick questions. 99% means the court keeps deliberating until near-unanimous agreement is reached. You can always accept a partial result early if the reasoning is already good enough.",
                  },
                  {
                    num: "09",
                    label: "Maximum Iterations",
                    options: ["1", "3", "5", "10"],
                    desc: "How many full rounds of cross-examination the court runs before it's forced to a verdict. One round is a single pass — fast. Ten rounds means every model challenges every other model repeatedly until positions are exhausted. More iterations = higher cost, deeper output.",
                  },
                  {
                    num: "10",
                    label: "Maximum Credits",
                    options: ["10", "15", "25", "50", "100"],
                    desc: "A hard spending cap per session. The court will stop and pause for your decision if it hits this limit mid-deliberation — you can accept the partial result or add more credits and continue. This protects you from runaway costs on complex questions.",
                  },
                  {
                    num: "11",
                    label: "AI Provider & Model",
                    options: ["Gemini", "Grok", "Custom"],
                    desc: "Which AI engine powers the court. Each provider has different models at different credit costs. You can lock all litigants to one provider, or let the system assign them. Bring your own API key via Custom to use any OpenAI-compatible model.",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04 }}
                    className="p-6 border border-border/50 bg-card hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="text-3xl font-bold font-mono text-primary/20 leading-none select-none shrink-0 mt-0.5">
                        {item.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold mb-2">{item.label}</h3>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {item.options.map((opt) => (
                            <span key={opt} className="text-[11px] font-mono px-2 py-0.5 rounded border border-primary/25 bg-primary/5 text-primary/80">
                              {opt}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. Use Cases ── */}
        <section id="use-cases" className="section">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-2xl"
              >
                <h2 className="text-4xl font-bold tracking-tight mb-4">Put Your Toughest Questions on Trial</h2>
                <p className="text-lg text-muted-foreground">
                  14 purpose-built tools — each one deploys a panel of AI models to cross-examine your question and deliver a verdict.
                </p>
              </motion.div>
            </div>

            <div className="row">
              <div className="layout__split-4">
                {TOOL_PAGES.map((tool, i) => {
                  const Icon = TOOL_ICON_MAP[tool.icon] ?? Briefcase;
                  return (
                    <motion.div
                      key={tool.slug}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Link href={`/tools/${tool.slug}`}>
                        <div className="p-5 border border-border/40 bg-card/60 hover:border-primary/40 hover:bg-card transition-all group cursor-pointer h-full">
                          <Icon className="w-6 h-6 text-primary mb-3 group-hover:scale-110 transition-transform" />
                          <h3 className="font-semibold text-sm mb-1.5 group-hover:text-primary transition-colors">{tool.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">{tool.metaDescription}</p>
                          <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Try free <ChevronRight className="w-3 h-3" />
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. How It Works ── */}
        <section id="how-it-works" className="section section--alt section--bordered">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-2xl"
              >
                <span className="eyebrow">⚖ Trial Protocol</span>
                <h2 className="text-4xl font-bold tracking-tight mb-4">From question to verdict — six deliberate steps.</h2>
                <p className="text-lg text-muted-foreground">
                  Not a chatbot. A structured pipeline of specialised AI seats, each with a defined job.
                </p>
              </motion.div>
            </div>

            <div className="row">
              <div className="layout__split-3">
                {HOW_IT_WORKS.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="relative flex gap-5"
                  >
                    <div className="text-4xl font-bold font-mono text-primary/20 leading-none select-none shrink-0 pt-1">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="text-base font-bold mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 4b. Court Seats ── */}
        <section className="section section--bordered">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-3xl"
              >
                <span className="eyebrow">⬡ Court Architecture</span>
                <h2 className="text-4xl font-bold tracking-tight mb-4">Six seats. Six jobs. Any AI in any chair.</h2>
                <p className="text-lg text-muted-foreground">
                  Every seat has a defined role and a defined brief. As admin you assign which AI model sits in each one — GPT-4o as Architect, Claude as Builder, Grok as Skeptic. Users pick from what you've connected.
                </p>
              </motion.div>
            </div>

            <div className="row">
              <div className="layout__split-3">
                {COURT_SEATS.map((seat, i) => {
                  const Icon = seat.icon;
                  return (
                    <motion.div
                      key={seat.id}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.07 }}
                      className={cn("p-6 border rounded-none", seat.border, seat.bg)}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className={cn("p-2 rounded border", seat.border)}>
                          <Icon className={cn("w-4 h-4", seat.color)} />
                        </div>
                        <span className={cn("text-sm font-bold font-mono uppercase tracking-wider", seat.color)}>
                          {seat.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{seat.desc}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-10 p-5 border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-bold text-primary mb-1">Each seat has its own brief.</div>
                <p className="text-sm text-muted-foreground">Every seat is governed by a markdown document defining its responsibilities, tone, and constraints. Admin can refine any brief at any time — the court picks it up within minutes, no redeploy needed.</p>
              </div>
              <Button asChild variant="outline" className="shrink-0 rounded-none border-primary/30 text-primary hover:bg-primary/10">
                <Link href={isSignedIn ? "/session" : "/register"}>Try the Court</Link>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* ── 4c. Rebuttal Loop ── */}
        <section className="section section--alt section--bordered">
          <div className="lgt-container">
            <div className="layout__split-2 items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <span className="eyebrow">⟳ The Rebuttal Loop</span>
                <h2 className="text-4xl font-bold tracking-tight mb-6">The verdict is not the end. It's the opening argument.</h2>
                <p className="text-muted-foreground mb-8 leading-relaxed text-lg">
                  Challenge the court's conclusion. Tell it what it missed. The court reconvenes specifically to address your challenge — not to re-run the whole debate, but to respond directly to your rebuttal. Continue until you're satisfied.
                </p>
                <ul className="space-y-4">
                  {[
                    "Court delivers verdict — you challenge a specific point",
                    "Court reconvenes and responds to your exact challenge",
                    "You accept, or challenge again with new reasoning",
                    "Loop ends when you're satisfied — or credits run out",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-primary font-mono">{i + 1}</span>
                      </div>
                      <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-3"
              >
                {[
                  { from: "You", text: "Is this business model viable?", align: "right", accent: false },
                  { from: "Court", text: "Verdict: viable with caveats. Unit economics hold at scale, but CAC payback exceeds 18 months in the base case.", align: "left", accent: true },
                  { from: "You", text: "You ignored the enterprise contract pipeline — those deals close in 90 days.", align: "right", accent: false },
                  { from: "Court", text: "Acknowledged. Reconvening on enterprise channel dynamics. Confidence revising upward.", align: "left", accent: true },
                  { from: "You", text: "Satisfied. Save this session.", align: "right", accent: false },
                ].map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={cn("flex", msg.align === "right" ? "justify-end" : "justify-start")}
                  >
                    <div className={cn(
                      "max-w-[85%] px-4 py-3 text-sm leading-relaxed",
                      msg.accent
                        ? "border border-primary/30 bg-primary/5 text-foreground"
                        : "border border-border bg-card text-muted-foreground"
                    )}>
                      <div className={cn("text-[10px] font-mono uppercase tracking-widest mb-1.5", msg.accent ? "text-primary" : "text-muted-foreground/60")}>
                        {msg.from}
                      </div>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 4d. Your Case Files ── */}
        <section className="section section--bordered">
          <div className="lgt-container">
            <div className="layout__split-2 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-4"
              >
                {[
                  { label: "Business Plan v2 — Series A pitch", date: "Jun 19", confidence: "88%", saved: true },
                  { label: "Contract dispute — supplier SLA clause 4.2", date: "Jun 17", confidence: "91%", saved: true },
                  { label: "Go-to-market strategy — US enterprise", date: "Jun 14", confidence: "79%", saved: true },
                  { label: "Hiring decision — CTO vs fractional", date: "Jun 11", confidence: "84%", saved: false },
                ].map((file, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-4 p-4 border border-border bg-card hover:border-primary/30 transition-colors group"
                  >
                    <FolderOpen className={cn("w-4 h-4 shrink-0", file.saved ? "text-primary" : "text-muted-foreground/40")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{file.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">{file.date} · {file.confidence} confidence</div>
                    </div>
                    {file.saved && (
                      <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-primary/30 text-primary bg-primary/5">
                        Saved
                      </span>
                    )}
                  </motion.div>
                ))}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <span className="eyebrow">◫ Your Case Files</span>
                <h2 className="text-4xl font-bold tracking-tight mb-6">Every verdict, on file.</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  When the Orchestrator delivers a verdict, it asks if you want to keep a copy. Logged-in users save directly to their case files — a searchable archive of every trial you've run.
                </p>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Free accounts get basic storage. Need more? Buy additional case file space — your intellectual work, properly organised and retrievable.
                </p>
                <Button asChild className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link href="/register">Create Free Account</Link>
                </Button>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 5. Visual Break ── */}
        <section className="section">
          <div className="lgt-container">
            <div className="layout__split-2 items-center">
              <div className="order-2 lg:order-1">
                <img
                  src={neuralImage}
                  alt="Neural pathways visualization"
                  className="w-full rounded-sm border border-border/50 shadow-[0_0_60px_-12px] shadow-primary/20"
                />
              </div>
              <div className="order-1 lg:order-2 max-w-xl">
                <h2 className="text-4xl font-bold tracking-tight mb-6">Not theater. Genuine disagreement.</h2>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  A single model playing multiple roles still reasons from one perspective. Litigant AI uses independently trained models with different architectures, training priors, and knowledge cutoffs — producing authentic intellectual conflict, not simulation.
                </p>
                <ul className="space-y-5">
                  {[
                    "Raw API access to GPT-4o, Claude, Gemini, and Llama simultaneously",
                    "Customizable court personas — Aggressive Skeptic, Logical Pedant, Empiricist",
                    "Real-time token and logic trace visualization",
                    "Export verdicts as PDF, Markdown, or raw JSON",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Pricing ── */}
        <section id="pricing" className="section section--alt section--bordered">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center max-w-2xl mx-auto"
              >
                <h2 className="text-4xl font-bold tracking-tight mb-4">Pay Only for What You Use</h2>
                <p className="text-lg text-muted-foreground">
                  No subscriptions. Credits never expire. Start free — top up when you need more.
                </p>
              </motion.div>
            </div>

            <div className="row">
              <div className="layout__split-4">
                {PLANS.map((plan, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className={cn(
                      "relative p-7 border flex flex-col",
                      plan.highlight
                        ? "border-primary bg-primary/5 shadow-[0_0_30px_-10px] shadow-primary/30"
                        : "border-border bg-card"
                    )}
                  >
                    {plan.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-widest rounded-full">
                        {plan.badge}
                      </div>
                    )}
                    <div className="mb-6">
                      <div className="text-sm font-mono text-muted-foreground uppercase tracking-widest mb-2">{plan.name}</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold font-mono">{plan.price}</span>
                        {plan.period && <span className="text-muted-foreground text-sm">{plan.period}</span>}
                      </div>
                      <div className="text-xs text-primary font-mono mt-1">{plan.credits}</div>
                    </div>

                    <ul className="space-y-2.5 flex-1 mb-7">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-primary mt-0.5">·</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      className={cn(
                        "w-full rounded-none",
                        plan.highlight
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-secondary text-foreground hover:bg-secondary/80"
                      )}
                    >
                      <Link href={plan.name === "Trial" ? (isSignedIn ? "/billing" : "/register") : (isSignedIn ? "/billing" : "/register")}>
                        {plan.name === "Trial"
                          ? (isSignedIn ? "Go to Billing" : "Start Free")
                          : (isSignedIn ? "Buy Credits" : "Get Started")}
                      </Link>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center text-xs text-muted-foreground mt-8"
            >
              100 credits = $1.00 · Credits never expire · Auto top-up available · Cancel anytime
            </motion.p>
          </div>
        </section>

        {/* ── 6b. Testimonials ── */}
        <section className="section section--alt section--bordered">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center max-w-xl mx-auto"
              >
                <span className="eyebrow">— In the field</span>
                <h2 className="text-3xl font-bold tracking-tight">What happens when you put real decisions on trial.</h2>
              </motion.div>
            </div>

            <div className="row">
              <div className="layout__split-3">
                {TESTIMONIALS.map((t, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="p-7 border border-border bg-card flex flex-col"
                  >
                    <div className="text-primary text-2xl font-serif leading-none mb-4 select-none">"</div>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">{t.quote}</p>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{t.role}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 7. FAQ ── */}
        <section id="faq" className="section">
          <div className="lgt-container">
            <div className="row">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-2xl"
              >
                <h2 className="text-4xl font-bold tracking-tight mb-4">Frequently Asked Questions</h2>
                <p className="text-muted-foreground">Objections answered before they're raised.</p>
              </motion.div>
            </div>

            <div className="row">
              <div className="max-w-2xl">
                {FAQ.map((item, i) => (
                  <FAQItem key={i} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 8. AI Disclaimer + CTA ── */}
        <section className="section section--alt section--bordered relative overflow-hidden">
          <div className="absolute inset-0 brain-grid opacity-20" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[400px] bg-primary/8 blur-[160px] pointer-events-none" />

          <div className="lgt-container relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-start gap-3 p-4 mb-12 border border-amber-500/30 bg-amber-500/5 rounded-sm text-left text-sm text-amber-400/80 max-w-xl mx-auto">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <span>
                  Litigant AI outputs are <strong className="text-amber-300">not legal, medical, financial, or professional advice</strong>. Verdicts represent probabilistic reasoning by AI models, not expert opinion. Always apply human judgment before acting on any output.
                </span>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="text-5xl font-bold tracking-tighter mb-6">Ready to convene the court?</h2>
                <p className="text-muted-foreground mb-10 text-lg">
                  Start free. No credit card required. Your first 100 credits are on us.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Button asChild size="lg" className="h-14 px-12 bg-primary hover:bg-primary/90 text-primary-foreground text-base rounded-none">
                    <Link href={isSignedIn ? "/session" : "/register"}>
                      {isSignedIn ? "Open App" : "Start Free — 100 credits included"} <ChevronRight className="ml-2 w-5 h-5" />
                    </Link>
                  </Button>
                  {!isSignedIn && (
                    <Button asChild variant="outline" size="lg" className="h-14 px-8 border-border hover:bg-secondary text-base rounded-none">
                      <Link href="/sign-in">Sign In</Link>
                    </Button>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-10 bg-background">
        <div className="lgt-container flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Litigant AI" className="h-6 w-auto opacity-60" />
            <span className="font-mono text-sm text-muted-foreground">© 2025</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            AI outputs are not legal, financial, or medical advice. Use judgment.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground font-mono">
            <a href="#" className="hover:text-primary transition-colors">Docs</a>
            <a href="#" className="hover:text-primary transition-colors">Status</a>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
