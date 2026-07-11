import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Scale, Users, Cpu, Hammer, ClipboardCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function VerdictTheatre() {
  const seats = [
    { icon: Brain, color: "text-yellow-500", bg: "bg-yellow-500/10", title: "Orchestrator", desc: "Speaks to you. Frames the question, routes it, delivers the verdict." },
    { icon: Scale, color: "text-blue-500", bg: "bg-blue-500/10", title: "Moderator", desc: "Controls courtroom flow, collects debate, briefs Architect." },
    { icon: Users, color: "text-green-500", bg: "bg-green-500/10", title: "Litigants", desc: "The debaters. Add as many as you want with +/− control." },
    { icon: Cpu, color: "text-purple-500", bg: "bg-purple-500/10", title: "Architect", desc: "Reads deliberation, designs the deliverable." },
    { icon: Hammer, color: "text-orange-500", bg: "bg-orange-500/10", title: "Builder", desc: "Executes Architect's blueprint, produces the document." },
    { icon: ClipboardCheck, color: "text-teal-500", bg: "bg-teal-500/10", title: "Auditor", desc: "Quality checks everything before release." },
  ];

  const steps = [
    "Submit the Question (free-form)",
    "Litigants Debate (multiple AI models, distinct positions)",
    "Moderator Collects (consensus + disagreement)",
    "Architect Designs Output (decides what to build)",
    "Builder Produces It (complete document)",
    "Verdict Delivered + rebuttal loop"
  ];

  const testimonials = [
    { role: "Founder, B2B SaaS", quote: "Found a hole in our unit economics that we'd missed for six months.", case: "Case #402-A" },
    { role: "Operations Lead, logistics firm", quote: "Built a risk memo I could actually send to our legal team. Saved me $800 in billable hours.", case: "Case #891-B" },
    { role: "CMO, e-commerce brand", quote: "By the third round, we had a completely different — and much sharper — positioning.", case: "Case #112-C" }
  ];

  const tiers = [
    { name: "Trial", price: "Free", credits: "100 credits", desc: "full access", cta: "Start Free" },
    { name: "Starter", price: "$4.99", credits: "500 credits", desc: "One-time pack", cta: "Buy Starter" },
    { name: "Pro Pack", price: "$19.99", credits: "2,200 credits", desc: "One-time pack", badge: "BEST VALUE", cta: "Buy Pro", highlight: true },
    { name: "Mega Pack", price: "$34.99", credits: "4,200 credits", desc: "+20% bonus", cta: "Buy Mega" },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-300 font-sans selection:bg-amber-500/30">
      <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#080808]/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-amber-500" />
            <span className="text-xl font-bold tracking-tight text-white font-serif">Litigant AI</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="text-sm font-medium hover:text-white transition-colors">Sign In</a>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-none border border-emerald-500/50">
              Start Free
            </Button>
          </div>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className="relative pt-24 pb-32 lg:pt-36 lg:pb-40 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-900/20 via-[#080808] to-[#080808] -z-10"></div>
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-7 z-10">
                <div className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-500 mb-6">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
                  The court is now in session
                </div>
                <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-serif text-white leading-[1.1] mb-6 tracking-tight">
                  Put Any Question <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-600 italic">on Trial.</span>
                </h1>
                <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl leading-relaxed border-l-2 border-amber-500/50 pl-6">
                  An AI debate engine. Multiple models argue your question, a dedicated panel moderates, and the court builds you a production-ready deliverable.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="h-14 px-8 text-base bg-emerald-600 hover:bg-emerald-700 text-white rounded-none shadow-[0_0_20px_rgba(5,150,105,0.3)]">
                    Start Free — 100 credits, no card
                  </Button>
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base rounded-none border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white bg-transparent">
                    See how it works
                  </Button>
                </div>
              </div>
              <div className="lg:col-span-5 relative">
                <div className="absolute -inset-4 bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 blur-3xl opacity-50"></div>
                <div className="relative aspect-[4/5] md:aspect-square lg:aspect-[3/4] border border-white/10 p-2 bg-black/50 shadow-2xl shadow-amber-900/20">
                  <img 
                    src="/__mockup/images/hero-theatre.png" 
                    alt="AI Courtroom" 
                    className="w-full h-full object-cover filter contrast-125 saturate-50 sepia-[.3]"
                  />
                  <div className="absolute inset-0 border border-white/5 mix-blend-overlay"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COURT CONVENES */}
        <section className="py-24 bg-[#0a0a0a] border-b border-white/5 relative">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-serif text-white mb-4">The Court Convenes</h2>
              <div className="w-12 h-1 bg-amber-600 mx-auto"></div>
            </div>
            
            <div className="relative">
              <div className="absolute left-[27px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-amber-500/50 via-zinc-800 to-transparent"></div>
              <div className="space-y-12">
                {steps.map((step, i) => (
                  <div key={i} className="relative flex gap-8 items-start group">
                    <div className="flex-shrink-0 w-14 h-14 rounded-none bg-[#080808] border border-amber-500/30 text-amber-500 flex items-center justify-center font-serif text-xl z-10 shadow-[0_0_15px_rgba(245,158,11,0.1)] group-hover:scale-110 transition-transform duration-300">
                      {i + 1}
                    </div>
                    <Card className="flex-grow bg-[#111] border-zinc-800 rounded-none group-hover:border-amber-500/30 transition-colors duration-300">
                      <CardContent className="p-6">
                        <p className="text-lg text-zinc-200 font-medium">{step}</p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* THE BENCH */}
        <section className="py-24 bg-[#080808] border-b border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800/20 to-transparent -z-10"></div>
          <div className="container mx-auto px-4">
            <div className="mb-16">
              <h2 className="text-3xl md:text-4xl font-serif text-white mb-4">The Bench</h2>
              <p className="text-zinc-400 max-w-2xl">The specialized AI agents that make up your dedicated panel.</p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {seats.map((seat, i) => {
                const Icon = seat.icon;
                return (
                  <Card key={i} className="bg-gradient-to-b from-[#111] to-[#0a0a0a] border-zinc-800 rounded-none hover:border-zinc-600 transition-all duration-300">
                    <CardHeader>
                      <div className={`w-12 h-12 rounded-none ${seat.bg} flex items-center justify-center mb-4 border border-current/20 ${seat.color}`}>
                        <Icon className={`w-6 h-6 ${seat.color}`} />
                      </div>
                      <CardTitle className="text-xl text-white font-serif">{seat.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-zinc-400">{seat.desc}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* FILED VERDICTS */}
        <section className="py-24 bg-[#0a0a0a] border-b border-white/5">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-serif text-white mb-4">Filed Verdicts</h2>
              <div className="w-12 h-1 bg-amber-600 mx-auto"></div>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((t, i) => (
                <div key={i} className="relative p-8 bg-[#eff0f2] text-zinc-900 shadow-xl before:absolute before:inset-0 before:border-2 before:border-zinc-300 before:m-2 transform hover:-translate-y-2 transition-transform duration-300">
                  <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-2 bg-[#0a0a0a]"></div>
                  </div>
                  <div className="border-b-2 border-zinc-300 pb-4 mb-6 flex justify-between items-end">
                    <span className="font-mono text-xs uppercase tracking-widest text-zinc-500 font-bold">Exhibit {i + 1}</span>
                    <span className="font-serif italic text-zinc-400">{t.case}</span>
                  </div>
                  <p className="text-lg font-serif italic mb-8 relative z-10">
                    "{t.quote}"
                  </p>
                  <div className="mt-auto">
                    <p className="font-bold text-sm uppercase tracking-wider">{t.role}</p>
                  </div>
                  <div className="absolute bottom-6 right-6 opacity-20">
                    <Scale className="w-12 h-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DOCKET (Pricing) */}
        <section className="py-24 bg-[#080808]">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-serif text-white mb-4">Docket</h2>
              <p className="text-zinc-400">Open a case today.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto items-end">
              {tiers.map((tier, i) => (
                <Card key={i} className={`rounded-none bg-[#111] border-zinc-800 relative ${tier.highlight ? 'border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.1)] lg:-translate-y-4' : ''}`}>
                  {tier.badge && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-500 text-black text-xs font-bold px-3 py-1 uppercase tracking-widest">
                      {tier.badge}
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-zinc-400 font-normal tracking-widest uppercase text-sm mb-2">{tier.name}</CardTitle>
                    <div className="text-4xl font-serif text-white mb-2">{tier.price}</div>
                    <CardDescription className="text-zinc-500">{tier.desc}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center py-6">
                    <div className="inline-block border-y border-white/10 py-3 px-6 text-lg text-emerald-400 font-mono">
                      {tier.credits}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className={`w-full rounded-none h-12 ${tier.highlight ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white'}`}>
                      {tier.cta}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-white/10 bg-[#050505]">
        <div className="container mx-auto px-4 text-center text-zinc-600 text-sm">
          <p>&copy; {new Date().getFullYear()} Litigant AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
