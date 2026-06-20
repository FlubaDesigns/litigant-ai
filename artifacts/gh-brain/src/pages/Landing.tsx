import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Brain, Gavel, Scale, Crosshair, ChevronRight, Zap, Shield,
  FileText, BarChart3, Code2, BookOpen, Lightbulb, Search,
  Briefcase, FlaskConical, Newspaper, Vote, TrendingUp, Globe,
  MessageSquare, Lock, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

import clashImage from "@/assets/images/hero-clash.png";
import neuralImage from "@/assets/images/neural-court.png";

// ── Use-case data ────────────────────────────────────────────────────────────
const USE_CASES = [
  { icon: Briefcase, title: "Due Diligence", desc: "Challenge acquisition assumptions with adversarial stress-testing before you sign." },
  { icon: FlaskConical, title: "Research Validation", desc: "Pit competing scientific interpretations against each other to expose weak methodology." },
  { icon: Newspaper, title: "Media Fact-Checking", desc: "Let skeptic models dismantle news claims with source cross-examination in real time." },
  { icon: Vote, title: "Policy Analysis", desc: "Test legislative proposals across ideological lenses before forming a position." },
  { icon: TrendingUp, title: "Investment Theses", desc: "Run bull and bear cases simultaneously to stress-test your conviction before deploying capital." },
  { icon: Globe, title: "Geopolitical Risk", desc: "Model competing interpretations of regional events from expert perspectives." },
  { icon: Code2, title: "Architecture Reviews", desc: "Have AI skeptics challenge system design decisions before you commit to the build." },
  { icon: BookOpen, title: "Legal Research", desc: "Test arguments from opposing counsel before entering the courtroom." },
  { icon: Search, title: "Competitive Intelligence", desc: "Pressure-test your product positioning against the steelman of the competition." },
  { icon: MessageSquare, title: "Debate Preparation", desc: "Identify the strongest counterarguments to your position so you're never blindsided." },
  { icon: Lightbulb, title: "Hypothesis Testing", desc: "Stress-test a new idea with a Socratic cross-examination before you invest in it." },
  { icon: FileText, title: "Report Critique", desc: "Surface hidden assumptions and logical gaps in long-form documents before they publish." },
];

// ── How it works ─────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Submit Your Question",
    desc: "Enter any contested claim, hypothesis, or decision. The more specific, the sharper the trial.",
  },
  {
    step: "02",
    title: "The Court Convenes",
    desc: "Litigant AI assigns roles: Advocate, Skeptic, Devil's Advocate, and Analyst — each powered by a different top-tier model.",
  },
  {
    step: "03",
    title: "Cross-Examination",
    desc: "Models challenge each other's reasoning in real time. Watch the weakest links in an argument get exposed.",
  },
  {
    step: "04",
    title: "The Verdict",
    desc: "A Synthesizer model delivers a final ruling with confidence scores, key uncertainties, and a one-paragraph executive summary.",
  },
];

// ── Pricing tiers ─────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    credits: "50 credits / month",
    highlight: false,
    features: [
      "3 sessions per month",
      "2 AI models in the courtroom",
      "Basic confidence scoring",
      "PDF export",
      "7-day session history",
    ],
  },
  {
    name: "Starter",
    price: "$19",
    period: "/mo",
    credits: "500 credits / month",
    highlight: false,
    features: [
      "Unlimited sessions",
      "4 AI models in the courtroom",
      "Advanced confidence scoring",
      "All export formats (PDF, MD, JSON)",
      "Custom court personas",
      "30-day history",
    ],
  },
  {
    name: "Pro",
    price: "$79",
    period: "/mo",
    credits: "2,500 credits / month",
    highlight: true,
    features: [
      "Everything in Starter",
      "6 AI models simultaneously",
      "Real-time token trace visualization",
      "Shareable verdict reports",
      "API access",
      "Unlimited history",
      "Priority processing",
    ],
  },
  {
    name: "Team",
    price: "$299",
    period: "/mo",
    credits: "15,000 credits / month",
    highlight: false,
    features: [
      "Everything in Pro",
      "Up to 10 seats",
      "Shared session library",
      "Admin dashboard",
      "SSO / SAML",
      "Dedicated support",
      "Custom model routing",
    ],
  },
];

// ── FAQ data ─────────────────────────────────────────────────────────────────
const FAQ = [
  {
    q: "What exactly is a 'credit'?",
    a: "One credit equals roughly 1,000 tokens consumed across all models in a session. A typical 3-model cross-examination uses 5–15 credits depending on depth.",
  },
  {
    q: "Which AI models are in the courtroom?",
    a: "Litigant AI routes across GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, and Llama 3 depending on your plan tier. Each model is assigned a distinct argumentative role.",
  },
  {
    q: "Can I choose which models argue which role?",
    a: "Yes — Pro and Team plans include custom court persona configuration. You can pin specific models to specific roles or let Litigant AI assign them dynamically.",
  },
  {
    q: "Is my data used to train any models?",
    a: "No. All sessions are processed via API calls to model providers. None of your input or output data is used for model training. Sessions are stored encrypted and tied to your account only.",
  },
  {
    q: "How is this different from asking ChatGPT to 'play devil's advocate'?",
    a: "A single model playing multiple roles still reasons from a single underlying perspective. Litigant AI uses genuinely independent models with different training priors, architectures, and knowledge cutoffs — producing authentic disagreement, not theater.",
  },
  {
    q: "Can I share a verdict report publicly?",
    a: "Yes. Pro and Team plans allow you to generate a shareable link to a read-only verdict report. No login required to view shared reports.",
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
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            <span className="font-bold tracking-tight text-lg">Litigant AI</span>
          </div>
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

      <main className="pt-16">

        {/* ── 1. Hero ── */}
        <section className="relative min-h-[92vh] flex items-center overflow-hidden">
          <div className="absolute inset-0 brain-grid opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/8 rounded-[100%] blur-[140px] pointer-events-none" />

          <div className="container mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono uppercase tracking-wider mb-6">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
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
        </section>

        {/* ── 2. Core Features ── */}
        <section className="py-28 bg-secondary/20 border-y border-border">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mb-16"
            >
              <h2 className="text-4xl font-bold tracking-tight mb-4">The Architecture of Truth</h2>
              <p className="text-lg text-muted-foreground">
                Consensus is the enemy of insight. Litigant AI pits state-of-the-art models against each other in rigorous cross-examination to eliminate hallucinations and extract hard truths.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Gavel,
                  title: "Adversarial Cross-Examination",
                  desc: "Models don't just answer — they debate. Watch them tear apart each other's logic to find the weakest link in the reasoning chain.",
                },
                {
                  icon: Scale,
                  title: "Weighted Confidence Scoring",
                  desc: "Every claim is assigned a strict probability score based on cross-model agreement, source quality, and logical coherence.",
                },
                {
                  icon: Crosshair,
                  title: "Precision Verdict Extraction",
                  desc: "Eliminate the noise. A synthesizer model delivers a dense analytical report with the final ruling and key dissenting points.",
                },
                {
                  icon: BarChart3,
                  title: "Real-Time Logic Trace",
                  desc: "Watch the reasoning unfold token by token. See exactly where each model agrees, diverges, or capitulates under pressure.",
                },
                {
                  icon: Shield,
                  title: "Hallucination Pressure Testing",
                  desc: "Adversarial models actively challenge unverified claims, dramatically reducing the probability of confident falsehoods surviving the trial.",
                },
                {
                  icon: FileText,
                  title: "Exportable Verdict Reports",
                  desc: "Export full session transcripts and verdicts as PDF, Markdown, or raw JSON. Share read-only reports via a public link.",
                },
              ].map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="p-7 border border-border/50 bg-card hover:border-primary/40 transition-colors group cursor-default"
                >
                  <f.icon className="w-9 h-9 text-primary mb-5 group-hover:scale-110 transition-transform" />
                  <h3 className="text-lg font-bold mb-3">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. Use Cases ── */}
        <section id="use-cases" className="py-28">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-2xl mb-16"
            >
              <h2 className="text-4xl font-bold tracking-tight mb-4">Who Convenes the Court?</h2>
              <p className="text-lg text-muted-foreground">
                Wherever contested claims meet high stakes, Litigant AI delivers adversarial clarity.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {USE_CASES.map((uc, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                  className="p-5 border border-border/40 bg-card/60 hover:border-primary/40 hover:bg-card transition-all group"
                >
                  <uc.icon className="w-6 h-6 text-primary mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-sm mb-1.5">{uc.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{uc.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. How It Works ── */}
        <section id="how-it-works" className="py-28 bg-secondary/20 border-y border-border">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-2xl mb-16"
            >
              <h2 className="text-4xl font-bold tracking-tight mb-4">Trial Protocol</h2>
              <p className="text-lg text-muted-foreground">
                Four deliberate steps separate a raw question from a battle-tested verdict.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {HOW_IT_WORKS.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="relative"
                >
                  <div className="text-6xl font-bold font-mono text-primary/15 mb-4 leading-none select-none">
                    {step.step}
                  </div>
                  <h3 className="text-lg font-bold mb-3">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="hidden lg:block absolute top-8 -right-4 w-8 h-px bg-border" />
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. Visual Break ── */}
        <section className="py-28">
          <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
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
        <section id="pricing" className="py-28 bg-secondary/20 border-y border-border">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto mb-16"
            >
              <h2 className="text-4xl font-bold tracking-tight mb-4">Access the Court</h2>
              <p className="text-lg text-muted-foreground">
                Compute is not free. Insight is priceless. Four tiers — from first trial to enterprise-scale analysis.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
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
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-widest rounded-full">
                      Most Popular
                    </div>
                  )}
                  <div className="mb-6">
                    <div className="text-sm font-mono text-muted-foreground uppercase tracking-widest mb-2">{plan.name}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold font-mono">{plan.price}</span>
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
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
                    <Link href={plan.name === "Team" ? "#" : isSignedIn ? "/billing" : "/register"}>
                      {plan.name === "Team" ? "Contact Sales" : isSignedIn ? "Buy Credits" : "Get Started"}
                    </Link>
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7. FAQ ── */}
        <section id="faq" className="py-28">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-2xl mb-12"
            >
              <h2 className="text-4xl font-bold tracking-tight mb-4">Frequently Asked Questions</h2>
              <p className="text-muted-foreground">Objections answered before they're raised.</p>
            </motion.div>

            <div className="max-w-2xl">
              {FAQ.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* ── 8. AI Disclaimer + CTA ── */}
        <section className="py-28 relative overflow-hidden bg-secondary/20 border-y border-border">
          <div className="absolute inset-0 brain-grid opacity-20" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[400px] bg-primary/8 blur-[160px] pointer-events-none" />

          <div className="container mx-auto px-6 relative z-10 max-w-3xl text-center">
            {/* Disclaimer */}
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
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-10 bg-background">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-muted-foreground" />
            <span className="font-mono text-sm text-muted-foreground">Litigant AI © 2025</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            AI outputs are not legal, financial, or medical advice. Use judgment.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground font-mono">
            <a href="#" className="hover:text-primary transition-colors">Docs</a>
            <a href="#" className="hover:text-primary transition-colors">Status</a>
            <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-primary transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
