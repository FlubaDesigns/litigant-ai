import React, { useState } from "react";
import { Brain, Scale, Users, Cpu, Hammer, ClipboardCheck, CheckCircle2, ChevronDown, Activity, Shield, Zap, Lock } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";

export function IntelligenceFeed() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    { q: "What models are included?", a: "We route queries across GPT-4, Claude 3.5, Gemini 1.5, and specialized legal models depending on the required task." },
    { q: "How are credits consumed?", a: "Different roles and model sizes consume varying credits. A standard simple query takes about 10-15 credits, while complex multi-model debates can consume 50-100." },
    { q: "Do you train on my data?", a: "No. We have zero-retention agreements with our model providers. Your queries and documents are permanently deleted after the session." },
    { q: "Can I export the final output?", a: "Yes. Every verdict and generated document can be exported as PDF, DOCX, or Markdown." },
    { q: "How long does a debate take?", a: "Most standard questions conclude in 30-90 seconds. Deep, multi-round debates may take up to 3 minutes." },
    { q: "Can I interject during a debate?", a: "Yes. You can pause the orchestrator, add new evidence, or redirect the litigants mid-debate." },
    { q: "Is there a monthly subscription?", a: "No. We currently operate entirely on simple, transparent credit packs. Buy what you need, they never expire." },
    { q: "What happens if I run out of credits mid-session?", a: "Your session pauses automatically. You can top up your account and resume exactly where you left off." }
  ];

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 text-slate-50 font-sans selection:bg-blue-500/30 selection:text-blue-200">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">Litigant AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#" className="hover:text-white transition-colors">How it works</a>
            <a href="#" className="hover:text-white transition-colors">The Panel</a>
            <a href="#" className="hover:text-white transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href="#" className="text-sm font-medium text-slate-300 hover:text-white hidden sm:block">Sign In</a>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white border-0">Start Free</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-24 pb-16 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20 mb-6 hover:bg-blue-500/20">Litigant AI 2.0 is live</Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
            Put Any Question <br className="hidden md:block"/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">on Trial</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            An AI debate engine. Multiple models argue your question, a dedicated panel moderates, and the court builds you a production-ready deliverable.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white h-12 px-8 text-base">
              Start Free — 100 credits, no card
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto border-slate-700 text-slate-800 hover:bg-slate-800 hover:text-white h-12 px-8 text-base bg-white">
              See how it works
            </Button>
          </div>
          
          <div className="mt-16 relative rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-blue-900/20">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />
            <img 
              src="/__mockup/images/hero-feed.png" 
              alt="AI Network Concept" 
              className="w-full h-auto object-cover aspect-video bg-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <div className="border-y border-white/5 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/5">
            <div className="flex flex-col items-center justify-center text-center px-4">
              <Activity className="w-5 h-5 text-blue-400 mb-2" />
              <div className="text-2xl font-bold text-white mb-1">10,000+</div>
              <div className="text-sm text-slate-400">Sessions completed</div>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-4">
              <Brain className="w-5 h-5 text-purple-400 mb-2" />
              <div className="text-2xl font-bold text-white mb-1">6 AI Models</div>
              <div className="text-sm text-slate-400">Debating per trial</div>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-4">
              <Zap className="w-5 h-5 text-yellow-400 mb-2" />
              <div className="text-2xl font-bold text-white mb-1">23 Credits</div>
              <div className="text-sm text-slate-400">Avg. cost per session</div>
            </div>
            <div className="flex flex-col items-center justify-center text-center px-4">
              <Lock className="w-5 h-5 text-green-400 mb-2" />
              <div className="text-2xl font-bold text-white mb-1">100%</div>
              <div className="text-sm text-slate-400">Privacy guaranteed</div>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <section className="py-24 px-6 relative">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">From Question to Verdict in 6 Steps</h2>
            <p className="text-slate-400 text-lg">Watch our specialized agents deconstruct and resolve complex queries.</p>
          </div>

          <div className="space-y-4">
            {[
              { title: "Submit the Question", desc: "Input your problem free-form. No prompt engineering required." },
              { title: "Litigants Debate", desc: "Multiple AI models take distinct positions and argue the merits." },
              { title: "Moderator Collects", desc: "Synthesizes consensus, highlights disagreement, and identifies gaps." },
              { title: "Architect Designs Output", desc: "Decides exactly what format and structure will best deliver the answer." },
              { title: "Builder Produces It", desc: "Executes the Architect's blueprint into a complete, formatted document." },
              { title: "Verdict Delivered", desc: "Review the final output and optionally initiate a rebuttal loop." }
            ].map((step, i) => (
              <div key={i} className="flex flex-col md:flex-row items-start md:items-center gap-6 p-6 rounded-xl border border-white/5 bg-slate-900/40 hover:bg-slate-800/60 transition-colors">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xl">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-slate-400">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Panel */}
      <section className="py-24 px-6 bg-slate-900/30 border-y border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Meet Your Dedicated Panel</h2>
            <p className="text-slate-400 text-lg">Six specialized roles. One cohesive outcome.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Brain, color: "text-yellow-400", border: "border-t-yellow-400", name: "Orchestrator", desc: "Speaks to you. Frames the question, routes it, delivers the verdict." },
              { icon: Scale, color: "text-blue-400", border: "border-t-blue-400", name: "Moderator", desc: "Controls courtroom flow, collects debate, briefs Architect." },
              { icon: Users, color: "text-emerald-400", border: "border-t-emerald-400", name: "Litigants", desc: "The debaters. Add as many as you want with +/− control." },
              { icon: Cpu, color: "text-purple-400", border: "border-t-purple-400", name: "Architect", desc: "Reads deliberation, designs the final deliverable." },
              { icon: Hammer, color: "text-orange-400", border: "border-t-orange-400", name: "Builder", desc: "Executes Architect's blueprint, produces the document." },
              { icon: ClipboardCheck, color: "text-teal-400", border: "border-t-teal-400", name: "Auditor", desc: "Quality checks everything before final release." }
            ].map((role, i) => (
              <Card key={i} className={`bg-slate-900/50 border-white/10 ${role.border} border-t-2 rounded-xl overflow-hidden`}>
                <CardContent className="p-6">
                  <role.icon className={`w-8 h-8 ${role.color} mb-4`} />
                  <h3 className="text-xl font-bold text-white mb-2">{role.name}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{role.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-24 px-6 relative">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-white/5 relative">
              <div className="text-blue-500 mb-6 flex text-lg">"</div>
              <p className="text-slate-300 italic mb-6 text-lg">Found a hole in our unit economics that we'd missed for six months.</p>
              <div>
                <div className="font-semibold text-white">Founder</div>
                <div className="text-slate-500 text-sm">B2B SaaS</div>
              </div>
            </div>
            
            <div className="p-8 rounded-2xl bg-slate-800 border border-blue-500/20 relative shadow-xl shadow-blue-900/10">
              <div className="text-blue-500 mb-6 flex text-lg">"</div>
              <p className="text-white italic mb-6 text-lg">Built a risk memo I could actually send to our legal team. Saved me $800 in billable hours.</p>
              <div>
                <div className="font-semibold text-white">Operations Lead</div>
                <div className="text-blue-300 text-sm">Logistics Firm</div>
              </div>
            </div>
            
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-white/5 relative">
              <div className="text-blue-500 mb-6 flex text-lg">"</div>
              <p className="text-slate-300 italic mb-6 text-lg">By the third round, we had a completely different — and much sharper — positioning.</p>
              <div>
                <div className="font-semibold text-white">CMO</div>
                <div className="text-slate-500 text-sm">E-commerce Brand</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6 bg-slate-900/30 border-y border-white/5">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple Credit Packs</h2>
            <p className="text-slate-400 text-lg">Pay only for what you use. No subscriptions required.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
            <Card className="bg-slate-900 border-white/10 p-6 flex flex-col h-full rounded-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-white mb-1">Trial</h3>
                <div className="text-3xl font-bold text-white mb-1">Free</div>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-slate-500 mr-2" />100 credits</li>
                <li className="flex items-center text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-slate-500 mr-2" />Full access</li>
              </ul>
              <Button variant="outline" className="w-full border-slate-700 text-slate-800 bg-white hover:bg-slate-200">Start Trial</Button>
            </Card>

            <Card className="bg-slate-900 border-white/10 p-6 flex flex-col h-full rounded-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-white mb-1">Starter</h3>
                <div className="text-3xl font-bold text-white mb-1">$4.99</div>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-blue-500 mr-2" />500 credits</li>
                <li className="flex items-center text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-blue-500 mr-2" />Never expires</li>
              </ul>
              <Button variant="outline" className="w-full border-slate-700 text-slate-800 bg-white hover:bg-slate-200">Buy Starter</Button>
            </Card>

            <Card className="bg-slate-800 border-blue-500 p-1 rounded-2xl relative transform lg:-translate-y-4 shadow-xl shadow-blue-900/20">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                BEST VALUE
              </div>
              <div className="bg-slate-900/80 p-6 h-full rounded-xl flex flex-col">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-blue-300 mb-1">Pro Pack</h3>
                  <div className="text-4xl font-bold text-white mb-1">$19.99</div>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                  <li className="flex items-center text-sm text-white font-medium"><CheckCircle2 className="w-4 h-4 text-blue-500 mr-2" />2,200 credits</li>
                  <li className="flex items-center text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-blue-500 mr-2" />Never expires</li>
                </ul>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Buy Pro Pack</Button>
              </div>
            </Card>

            <Card className="bg-slate-900 border-white/10 p-6 flex flex-col h-full rounded-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-white mb-1">Mega Pack</h3>
                <div className="text-3xl font-bold text-white mb-1">$34.99</div>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />4,200 credits</li>
                <li className="flex items-center text-sm text-green-400 font-medium"><CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />+20% bonus included</li>
              </ul>
              <Button variant="outline" className="w-full border-slate-700 text-slate-800 bg-white hover:bg-slate-200">Buy Mega Pack</Button>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 relative">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-white/10 rounded-lg overflow-hidden bg-slate-900/30">
                <button 
                  onClick={() => toggleFaq(i)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
                >
                  <span className="font-medium text-white">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-4 bg-slate-900/50">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950 py-12 px-6">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-white">Litigant AI</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          
          <div className="text-sm text-slate-500">
            © {new Date().getFullYear()} Litigant AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default IntelligenceFeed;
