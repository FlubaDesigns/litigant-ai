import React, { useEffect, useState } from "react";
import { 
  Brain, 
  Scale, 
  Users, 
  Cpu, 
  Hammer, 
  ClipboardCheck, 
  Terminal, 
  ShieldAlert, 
  CheckCircle2, 
  Activity, 
  ChevronRight, 
  Play, 
  Database,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CommandRoom() {
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setBlink((b) => !b), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-slate-300 font-sans selection:bg-green-500/30 selection:text-green-400 relative overflow-hidden">
      {/* Scanline texture */}
      <div 
        className="pointer-events-none fixed inset-0 z-50 opacity-10" 
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0) 50%, rgba(0, 255, 136, 0.1) 50%)`,
          backgroundSize: '100% 4px'
        }}
      />
      
      {/* Grid background */}
      <div 
        className="absolute inset-0 z-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 255, 136, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 136, 0.5) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="border-b border-green-500/20 bg-black/80 backdrop-blur-md sticky top-0 z-40">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-green-500 font-mono tracking-tight font-bold text-xl">
                <Terminal className="w-5 h-5" />
                LITIGANT_AI
              </div>
              <Badge variant="outline" className="font-mono text-xs border-green-500/30 text-green-400 rounded-none bg-green-500/5">v2.1</Badge>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-green-400">
                <span className={`w-2 h-2 rounded-full bg-green-500 ${blink ? 'opacity-100' : 'opacity-40'}`}></span>
                SYSTEM OPERATIONAL
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" className="font-mono text-xs text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded-none h-8">
                  [ LOGIN ]
                </Button>
                <Button className="font-mono text-xs bg-green-500 hover:bg-green-400 text-black rounded-none h-8 px-6 font-bold shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] transition-all">
                  DEPLOY FREE
                </Button>
              </div>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="relative pt-24 pb-32 border-b border-green-500/20">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 font-mono text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1">
                  [ AI COURTROOM ACTIVE ]
                </div>
                
                <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.1] tracking-tight mb-6">
                  PUT ANY <br/>
                  <span className="text-green-500 font-mono font-bold tracking-tighter">QUESTION</span> <br/>
                  ON TRIAL.
                </h1>
                
                <p className="text-lg text-slate-400 mb-10 max-w-xl leading-relaxed border-l-2 border-green-500/30 pl-4 font-mono text-sm">
                  An AI debate engine. Multiple models argue your question, a dedicated panel moderates, and the court builds you a production-ready deliverable.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 font-mono">
                  <a href="#" className="group flex items-center justify-between gap-4 bg-green-500/10 border border-green-500 hover:bg-green-500 text-green-400 hover:text-black px-6 py-4 transition-all duration-300">
                    <span className="font-bold">&gt; run trial --free</span>
                    <span className="text-xs opacity-80 group-hover:text-black">100 CREDITS</span>
                  </a>
                  <a href="#" className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-green-500/50 hover:bg-slate-800 text-slate-300 px-6 py-4 transition-all duration-300">
                    <span>&gt; view docs</span>
                  </a>
                </div>
              </div>
              
              <div className="relative">
                <div className="absolute -inset-1 bg-green-500/20 blur-xl rounded-full"></div>
                <div className="relative border border-green-500/30 bg-black p-2 shadow-[0_0_30px_rgba(0,255,136,0.1)]">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-green-500"></div>
                  <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-green-500"></div>
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-green-500"></div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-green-500"></div>
                  
                  <div className="flex items-center justify-between border-b border-green-500/20 pb-2 mb-2 px-2 font-mono text-[10px] text-green-500/70">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3 h-3" />
                      SYS.MONITOR // CAM_01
                    </div>
                    <div>REC <span className={blink ? 'opacity-100 text-red-500' : 'opacity-0'}>●</span></div>
                  </div>
                  
                  <div className="aspect-video bg-slate-900 relative overflow-hidden flex items-center justify-center">
                    <img 
                      src="/__mockup/images/hero-command.png" 
                      alt="Command Room" 
                      className="object-cover w-full h-full opacity-80 mix-blend-luminosity"
                    />
                    <div className="absolute inset-0 bg-green-900/10 mix-blend-color"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SEQUENCE */}
        <section className="py-24 border-b border-green-500/20 bg-slate-950">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="flex items-center gap-4 mb-16">
              <h2 className="font-mono text-2xl font-bold text-white tracking-widest">
                // TRIAL_SEQUENCE
              </h2>
              <div className="h-px bg-green-500/20 flex-grow"></div>
            </div>

            <div className="space-y-0">
              {[
                { num: "01", title: "SUBMIT QUESTION", desc: "Initialize free-form prompt", status: "PENDING" },
                { num: "02", title: "LITIGANTS DEBATE", desc: "Multiple AI models, distinct positions", status: "PROCESSING" },
                { num: "03", title: "MODERATOR COLLECTS", desc: "Consensus + disagreement synthesis", status: "WAITING" },
                { num: "04", title: "ARCHITECT DESIGNS", desc: "Blueprint generation for output", status: "WAITING" },
                { num: "05", title: "BUILDER PRODUCES", desc: "Complete document assembly", status: "WAITING" },
                { num: "06", title: "VERDICT DELIVERED", desc: "Final output + rebuttal loop", status: "HALTED" }
              ].map((step, i) => (
                <div key={i} className="flex gap-6 relative group">
                  {/* Timeline line */}
                  {i !== 5 && (
                    <div className="absolute left-[23px] top-[40px] bottom-[-20px] w-px bg-green-500/20 group-hover:bg-green-500/50 transition-colors"></div>
                  )}
                  
                  <div className="relative z-10 flex-none bg-black mt-1">
                    <div className="w-12 h-12 border border-green-500/30 flex items-center justify-center font-mono text-green-500 bg-slate-900/50 group-hover:border-green-500 group-hover:bg-green-500/10 transition-colors">
                      {step.num}
                    </div>
                  </div>
                  
                  <div className="pb-10 pt-2 flex-grow border-b border-white/5 mb-10 group-last:border-0 group-last:pb-0 group-last:mb-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                      <h3 className="font-mono font-bold text-lg text-white group-hover:text-green-400 transition-colors">{step.title}</h3>
                      <Badge variant="outline" className="self-start font-mono text-[10px] rounded-none border-slate-700 text-slate-400">
                        {step.status}
                      </Badge>
                    </div>
                    <p className="text-slate-400 text-sm font-mono">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ACTIVE PROCESSES */}
        <section className="py-24 border-b border-green-500/20">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-4 mb-16">
              <h2 className="font-mono text-2xl font-bold text-white tracking-widest">
                // ACTIVE_COURT_PROCESSES
              </h2>
              <div className="h-px bg-green-500/20 flex-grow"></div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { pid: "001", role: "ORCHESTRATOR", icon: Brain, color: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/5", desc: "Frames the question, routes it, delivers the verdict." },
                { pid: "002", role: "MODERATOR", icon: Scale, color: "text-blue-400", border: "border-blue-400/30", bg: "bg-blue-400/5", desc: "Controls courtroom flow, collects debate, briefs Architect." },
                { pid: "003", role: "LITIGANTS", icon: Users, color: "text-green-400", border: "border-green-400/30", bg: "bg-green-400/5", desc: "The debaters. Add as many as you want with +/- control." },
                { pid: "004", role: "ARCHITECT", icon: Cpu, color: "text-purple-400", border: "border-purple-400/30", bg: "bg-purple-400/5", desc: "Reads deliberation, designs the deliverable." },
                { pid: "005", role: "BUILDER", icon: Hammer, color: "text-orange-400", border: "border-orange-400/30", bg: "bg-orange-400/5", desc: "Executes Architect's blueprint, produces the document." },
                { pid: "006", role: "AUDITOR", icon: ClipboardCheck, color: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/5", desc: "Quality checks everything before release." },
              ].map((seat, i) => (
                <div key={i} className={`border ${seat.border} ${seat.bg} p-6 relative group hover:bg-slate-900/50 transition-colors`}>
                  <div className="absolute top-0 right-0 bg-black border-l border-b border-inherit px-2 py-1 font-mono text-[10px] text-slate-400 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    RUNNING
                  </div>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-10 h-10 border border-inherit flex items-center justify-center bg-black ${seat.color}`}>
                      <seat.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-mono text-[10px] text-slate-500 mb-1">PID: {seat.pid}</div>
                      <h3 className={`font-mono font-bold tracking-wider ${seat.color}`}>{seat.role}</h3>
                    </div>
                  </div>
                  
                  <p className="text-sm text-slate-400 font-mono leading-relaxed h-10">
                    {seat.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FILED REPORTS (Testimonials) */}
        <section className="py-24 border-b border-green-500/20 bg-slate-950">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-4 mb-16">
              <h2 className="font-mono text-2xl font-bold text-white tracking-widest">
                // CASE_REPORTS
              </h2>
              <div className="h-px bg-green-500/20 flex-grow"></div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { role: "Founder, B2B SaaS", text: "Found a hole in our unit economics that we'd missed for six months." },
                { role: "Operations Lead, logistics firm", text: "Built a risk memo I could actually send to our legal team. Saved me $800 in billable hours." },
                { role: "CMO, e-commerce brand", text: "By the third round, we had a completely different — and much sharper — positioning." }
              ].map((report, i) => (
                <div key={i} className="border border-green-500/20 bg-black p-8 relative">
                  <div className="absolute -top-3 left-4 bg-black px-2 font-mono text-[10px] text-green-500 border border-green-500/20">
                    REPORT_{String(i + 1).padStart(3, '0')}
                  </div>
                  <Database className="w-6 h-6 text-green-500/40 mb-6" />
                  <p className="text-slate-300 font-mono text-sm leading-relaxed mb-8">
                    "{report.text}"
                  </p>
                  <div className="border-t border-green-500/20 pt-4 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-green-400 uppercase">[{report.role}]</span>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ACCESS TIERS */}
        <section className="py-24 border-b border-green-500/20">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-center gap-4 mb-16">
              <div className="w-12 h-px bg-green-500/20"></div>
              <h2 className="font-mono text-2xl font-bold text-white tracking-widest text-center">
                // ACCESS_LEVELS
              </h2>
              <div className="w-12 h-px bg-green-500/20"></div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {[
                { name: "TRIAL", price: "FREE", credits: "100", highlight: false },
                { name: "STARTER", price: "$4.99", credits: "500", highlight: false },
                { name: "PRO PACK", price: "$19.99", credits: "2,200", highlight: true, badge: "BEST VALUE" },
                { name: "MEGA PACK", price: "$34.99", credits: "4,200", highlight: false, badge: "+20% BONUS" },
              ].map((tier, i) => (
                <div key={i} className={`border ${tier.highlight ? 'border-green-500' : 'border-slate-800'} bg-black p-6 relative flex flex-col`}>
                  {tier.badge && (
                    <div className={`absolute -top-3 right-4 px-2 font-mono text-[10px] border ${tier.highlight ? 'bg-green-500 text-black border-green-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                      {tier.badge}
                    </div>
                  )}
                  
                  <div className="font-mono text-xs text-slate-500 mb-2">LEVEL {String(i + 1).padStart(2, '0')}</div>
                  <h3 className={`font-mono text-xl font-bold mb-4 ${tier.highlight ? 'text-green-400' : 'text-white'}`}>{tier.name}</h3>
                  
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-3xl font-black text-white">{tier.price}</span>
                  </div>
                  
                  <div className="mb-8 font-mono text-sm border-l-2 border-slate-800 pl-3">
                    <div className="text-slate-400 mb-1">ALLOCATION:</div>
                    <div className="text-white font-bold">{tier.credits} CREDITS</div>
                  </div>
                  
                  <div className="mt-auto">
                    <Button 
                      className={`w-full font-mono text-xs rounded-none h-12 ${
                        tier.highlight 
                          ? 'bg-green-500 hover:bg-green-400 text-black shadow-[0_0_15px_rgba(34,197,94,0.2)]' 
                          : 'bg-slate-900 hover:bg-slate-800 text-green-400 border border-slate-800'
                      }`}
                    >
                      REQUEST ACCESS
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 bg-black">
          <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 font-mono text-slate-600 text-xs">
              <Terminal className="w-4 h-4" />
              © 2025 LITIGANT_AI SYSTEMS. ALL RIGHTS RESERVED.
            </div>
            <div className="font-mono text-slate-600 text-[10px] flex gap-4">
              <a href="#" className="hover:text-green-400 transition-colors">TERMS</a>
              <a href="#" className="hover:text-green-400 transition-colors">PRIVACY</a>
              <a href="#" className="hover:text-green-400 transition-colors">STATUS</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
