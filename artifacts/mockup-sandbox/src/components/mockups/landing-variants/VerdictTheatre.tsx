import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Scale, Users, Cpu, Hammer, ClipboardCheck, ChevronDown, Check } from 'lucide-react';

const STEPS = [
  {
    n: "01",
    title: "Submit the Question",
    body: "Put any contested claim, decision, or hypothesis on trial. Free-form — no template required. The Orchestrator frames it and opens the courtroom.",
  },
  {
    n: "02",
    title: "Litigants Debate",
    body: "A panel of AI models argue the question in real time — each holding a distinct position. Add as many as you want using the +/− control. The larger the panel, the sharper the cross-examination.",
  },
  {
    n: "03",
    title: "Moderator Collects",
    body: "The Moderator synthesises the debate: what was agreed, what was contested, what was the strongest argument on each side.",
  },
  {
    n: "04",
    title: "Architect Designs the Output",
    body: "The Architect reads the deliberation and decides what gets built — a legal brief, a decision memo, a risk matrix — whatever the question actually calls for.",
  },
  {
    n: "05",
    title: "Builder Produces It",
    body: "The Builder constructs the artifact to spec. A production-ready document the Auditor then quality-checks before release.",
  },
  {
    n: "06",
    title: "Verdict Delivered",
    body: "The Orchestrator returns a direct answer plus the built artifact. You challenge it — the court responds. Loop continues until you're satisfied or credits run out.",
  },
];

const SEATS = [
  { icon: Brain, color: "text-yellow-400", border: "border-yellow-400/40", glow: "shadow-yellow-500/10", title: "Orchestrator", desc: "Speaks directly to you. Frames the question, routes it into the courtroom, delivers the verdict, and asks if you want to keep a copy." },
  { icon: Scale, color: "text-blue-400", border: "border-blue-400/40", glow: "shadow-blue-500/10", title: "Moderator", desc: "Controls courtroom flow. Collects the debate, identifies consensus and disagreement, briefs the Architect on what to build." },
  { icon: Users, color: "text-emerald-400", border: "border-emerald-400/40", glow: "shadow-emerald-500/10", title: "Litigants", desc: "The debaters. Add as many as you want — each holds a distinct position, each powered by the AI you assign. Use the +/− control to set the panel size before the trial starts." },
  { icon: Cpu, color: "text-purple-400", border: "border-purple-400/40", glow: "shadow-purple-500/10", title: "Architect", desc: "Reads the deliberation and designs the deliverable. Decides whether this question needs a brief, a memo, a checklist, or a risk matrix." },
  { icon: Hammer, color: "text-orange-400", border: "border-orange-400/40", glow: "shadow-orange-500/10", title: "Builder", desc: "Executes the Architect's blueprint. Produces the actual document — complete, formatted, and ready to hand to someone." },
  { icon: ClipboardCheck, color: "text-teal-400", border: "border-teal-400/40", glow: "shadow-teal-500/10", title: "Auditor", desc: "Nothing leaves without sign-off. Checks the artifact against the blueprint, verifies claims, adds caveats, and either approves or sends it back." },
];

const TIERS = [
  { name: "Trial", price: "Free", credits: "100 credits", note: "No card required", cta: "Start Free", highlight: false, badge: null },
  { name: "Starter", price: "$4.99", credits: "500 credits", note: "~12–33 sessions", cta: "Buy Credits", highlight: false, badge: null },
  { name: "Pro Pack", price: "$19.99", credits: "2,200 credits", note: "+10% bonus included", cta: "Buy Credits", highlight: true, badge: "Best Value" },
  { name: "Mega Pack", price: "$34.99", credits: "4,200 credits", note: "+20% bonus included", cta: "Buy Credits", highlight: false, badge: null },
];

function StepAccordion() {
  const [open, setOpen] = useState<number>(0);
  return (
    <div className="divide-y divide-white/5">
      {STEPS.map((s, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? -1 : i)}
            className="w-full flex items-center gap-6 py-5 text-left group"
          >
            <span className="font-mono text-xs text-amber-500/60 tracking-widest w-6 shrink-0">{s.n}</span>
            <span className={`flex-1 text-base font-medium transition-colors ${open === i ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
              {s.title}
            </span>
            <ChevronDown className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180 text-amber-500' : ''}`} />
          </button>
          {open === i && (
            <div className="pb-6 pl-12 pr-6">
              <p className="text-zinc-400 leading-relaxed text-sm border-l border-amber-500/30 pl-5">
                {s.body}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SeatAccordion() {
  const [open, setOpen] = useState<number>(0);
  return (
    <div className="divide-y divide-white/5">
      {SEATS.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={i}>
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              className="w-full flex items-center gap-4 py-4 text-left group"
            >
              <div className={`w-8 h-8 shrink-0 flex items-center justify-center border ${s.border} bg-white/5`}>
                <Icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <span className={`flex-1 text-base font-medium transition-colors ${open === i ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                {s.title}
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 ${open === i ? `rotate-180 ${s.color}` : ''}`} />
            </button>
            {open === i && (
              <div className="pb-5 pl-12 pr-6">
                <p className="text-zinc-400 leading-relaxed text-sm">
                  {s.desc}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VerdictTheatre() {
  return (
    <div className="min-h-screen bg-[#080808] text-zinc-300 font-sans selection:bg-amber-500/30">

      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/8 bg-[#080808]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-500" />
            <span className="text-lg font-semibold tracking-tight text-white font-['Playfair_Display']">
              Litigant AI
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors hidden sm:block">Sign In</a>
            <Button className="h-9 px-5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-none">
              Start Free
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-28 pb-36 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_-10%,rgba(180,130,40,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_10%_80%,rgba(5,150,105,0.07),transparent)]" />

        <div className="relative max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 border border-amber-500/25 bg-amber-500/8 px-3 py-1 text-xs font-mono text-amber-400 mb-8 tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                COURT IN SESSION
              </div>
              <h1 className="text-6xl sm:text-7xl font-bold text-white leading-[1.05] mb-6 tracking-tight font-['Playfair_Display']">
                Put Any Question{' '}
                <em className="text-transparent bg-clip-text bg-gradient-to-br from-amber-300 to-amber-600 not-italic">
                  on Trial.
                </em>
              </h1>
              <p className="text-zinc-400 text-lg leading-relaxed mb-10 border-l-2 border-amber-500/40 pl-5 max-w-lg">
                An AI debate engine. Multiple models argue your question, a dedicated panel moderates, and the court builds you a production-ready deliverable.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" className="h-13 px-8 text-base bg-emerald-600 hover:bg-emerald-700 text-white rounded-none shadow-[0_0_24px_rgba(5,150,105,0.25)]">
                  Start Free — 100 credits, no card
                </Button>
                <Button size="lg" variant="outline" className="h-13 px-8 text-base rounded-none border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 bg-transparent">
                  See how it works
                </Button>
              </div>
            </div>

            {/* Right: image */}
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-tr from-amber-600/15 to-emerald-600/10 blur-3xl" />
              <div className="relative border border-white/10 bg-black/40 overflow-hidden aspect-[4/3] shadow-2xl shadow-black/60">
                <img
                  src="/__mockup/images/hero-theatre.png"
                  alt="AI Courtroom"
                  className="w-full h-full object-cover opacity-90 saturate-[0.7] contrast-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/60 via-transparent to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works — accordion */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-12">
            <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="text-3xl font-semibold text-white font-['Playfair_Display']">
              The Trial in Six Stages
            </h2>
          </div>
          <StepAccordion />
        </div>
      </section>

      {/* The Bench — accordion */}
      <section className="py-20 border-t border-white/5 bg-[#060606]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-12">
            <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3">THE PANEL</p>
            <h2 className="text-3xl font-semibold text-white font-['Playfair_Display']">
              The Bench
            </h2>
            <p className="text-zinc-500 mt-3 text-sm">Six specialized AI roles — each with a distinct responsibility.</p>
          </div>
          <SeatAccordion />
        </div>
      </section>

      {/* Verdicts — 2 compact quotes */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-12">FILED VERDICTS</p>
          <div className="space-y-10">
            <div>
              <p className="text-xl text-zinc-200 leading-relaxed mb-4 font-['Playfair_Display']">
                "The Skeptic found a hole in our unit economics that we'd missed for six months. We fixed the pitch deck that afternoon."
              </p>
              <p className="text-xs font-mono text-zinc-600 tracking-widest">— FOUNDER, B2B SAAS · SERIES A</p>
            </div>
            <div className="border-t border-white/5 pt-10">
              <p className="text-xl text-zinc-200 leading-relaxed mb-4 font-['Playfair_Display']">
                "By the third round, we had a completely different — and much sharper — positioning. Worth three strategy sessions."
              </p>
              <p className="text-xs font-mono text-zinc-600 tracking-widest">— CMO · E-COMMERCE BRAND</p>
            </div>
          </div>
        </div>
      </section>

      {/* Docket — Pricing */}
      <section className="py-20 border-t border-white/5 bg-[#060606]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-12 max-w-3xl">
            <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3">DOCKET</p>
            <h2 className="text-3xl font-semibold text-white font-['Playfair_Display']">
              Open a Case
            </h2>
            <p className="text-zinc-500 mt-3 text-sm">Credits never expire. No subscriptions, no seat fees — pay for what you use.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIERS.map((tier, i) => (
              <div
                key={i}
                className={`relative p-6 border flex flex-col ${
                  tier.highlight
                    ? 'border-amber-500/50 bg-amber-500/5 shadow-[0_0_40px_rgba(245,158,11,0.07)]'
                    : 'border-zinc-800 bg-[#0d0d0d]'
                }`}
              >
                {tier.badge && (
                  <span className="absolute -top-3 left-4 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 tracking-widest uppercase">
                    {tier.badge}
                  </span>
                )}
                <div className="mb-6">
                  <p className="text-xs font-mono text-zinc-600 tracking-widest uppercase mb-3">{tier.name}</p>
                  <p className="text-4xl font-semibold text-white mb-1 font-['Playfair_Display']">{tier.price}</p>
                  <p className="text-sm text-emerald-400 font-mono">{tier.credits}</p>
                  <p className="text-xs text-zinc-600 mt-1">{tier.note}</p>
                </div>
                <Button
                  className={`mt-auto w-full rounded-none h-10 text-sm ${
                    tier.highlight
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                >
                  {tier.cta}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-6 text-xs text-zinc-600 font-mono">
            {["All models included", "Export to Markdown & PDF", "Complete session history", "No subscription"].map(f => (
              <span key={f} className="flex items-center gap-2">
                <Check className="w-3 h-3 text-emerald-600" />{f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-500/60" />
            <span className="text-sm text-zinc-600 font-mono">LITIGANT AI</span>
          </div>
          <p className="text-xs text-zinc-700 font-mono">© {new Date().getFullYear()} · All rights reserved</p>
          <div className="flex gap-6 text-xs text-zinc-700 font-mono">
            <a href="#" className="hover:text-zinc-500 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-500 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
