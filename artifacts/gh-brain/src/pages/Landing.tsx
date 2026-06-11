import { motion } from "framer-motion";
import { Link } from "wouter";
import { Brain, Gavel, Scale, Crosshair, ChevronRight, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

import clashImage from "@/assets/images/hero-clash.png";
import neuralImage from "@/assets/images/neural-court.png";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      {/* Navbar */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary text-primary-glow" />
            <span className="font-bold tracking-tight text-lg">AI Brain</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Operator Login
            </Link>
            <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link href="/register">Request Access</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative min-h-[90vh] flex items-center overflow-hidden">
          <div className="absolute inset-0 brain-grid opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
          
          {/* Subtle glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-[100%] blur-[120px] pointer-events-none" />

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
              <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter mb-6 leading-[1.1]">
                Don't just ask AI.<br />
                <span className="text-primary-glow text-primary">Put the question on trial.</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 font-light max-w-xl">
                A high-stakes, adversarial reasoning engine for power users who refuse to trust a single AI response. Watch great minds clash.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button asChild size="lg" className="h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground text-lg rounded-none">
                  <Link href="/register">
                    Initiate Session <ChevronRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-14 px-8 border-border hover:bg-secondary text-lg rounded-none">
                  <a href="#architecture">Read Protocols</a>
                </Button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-sm overflow-hidden border border-border/50 shadow-2xl relative">
                <div className="absolute inset-0 bg-primary/10 mix-blend-overlay z-10" />
                <img 
                  src={clashImage} 
                  alt="Abstract adversarial AI courtroom clash" 
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Philosophy / Features Section */}
        <section id="architecture" className="py-32 bg-secondary/30 border-y border-border">
          <div className="container mx-auto px-6">
            <div className="max-w-3xl mb-20">
              <h2 className="text-4xl font-bold tracking-tight mb-6">The Architecture of Truth</h2>
              <p className="text-lg text-muted-foreground">
                Consensus is the enemy of insight. AI Brain pits state-of-the-art models against each other in a rigorous, logical cross-examination to eliminate hallucinations and extract hard truths.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Gavel,
                  title: "Adversarial Cross-Examination",
                  desc: "Models don't just answer; they debate. Watch them tear apart each other's logic to find the weakest link in the reasoning chain."
                },
                {
                  icon: Scale,
                  title: "Weighted Confidence Scoring",
                  desc: "Every claim is heavily scrutinized and assigned a strict probability score based on the underlying logical architecture."
                },
                {
                  icon: Crosshair,
                  title: "Precision Extraction",
                  desc: "Eliminate the fluff. Get a condensed, high-density analytical report summarizing the core debate and the final verdict."
                }
              ].map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="p-8 border border-border/50 bg-card hover:border-primary/50 transition-colors group"
                >
                  <feature.icon className="w-10 h-10 text-primary mb-6 group-hover:text-primary-glow transition-all" />
                  <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Visual Break Section */}
        <section className="py-32 relative overflow-hidden">
          <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1">
                <img 
                  src={neuralImage} 
                  alt="Glowing green neural pathways" 
                  className="w-full rounded-sm border border-border/50 shadow-[0_0_50px_-12px] shadow-primary/20"
                />
              </div>
              <div className="order-1 lg:order-2 max-w-xl">
                <h2 className="text-4xl font-bold tracking-tight mb-6">Dark Command Center</h2>
                <ul className="space-y-6">
                  {[
                    "Raw API-level access to top-tier LLMs",
                    "Customizable courtroom personas (e.g., Aggressive Skeptic, Logical Pedant)",
                    "Real-time token and logic trace visualization",
                    "Export verdicts as PDF, Markdown, or raw JSON"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <Zap className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                      <span className="text-lg text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Hint Section */}
        <section className="py-32 bg-secondary/30 border-y border-border">
          <div className="container mx-auto px-6 text-center max-w-3xl">
            <h2 className="text-4xl font-bold tracking-tight mb-6">Compute is not free. Insight is priceless.</h2>
            <p className="text-lg text-muted-foreground mb-12">
              Pay strictly for the tokens you burn during the trial. No monthly flat fees for casuals. This is professional-grade compute.
            </p>
            <div className="inline-block p-[1px] bg-gradient-to-r from-primary/50 to-accent/50 rounded-sm">
              <div className="bg-background px-12 py-8 rounded-sm">
                <div className="text-5xl font-mono font-bold mb-4">$0.00</div>
                <div className="text-primary font-mono text-sm tracking-widest uppercase mb-2">Base Access</div>
                <div className="text-muted-foreground text-sm">Pay-per-token API consumption</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 relative overflow-hidden text-center">
          <div className="absolute inset-0 brain-grid opacity-30" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-primary/10 blur-[150px] pointer-events-none" />
          
          <div className="container mx-auto px-6 relative z-10">
            <h2 className="text-5xl font-bold tracking-tighter mb-8">Ready to convene the court?</h2>
            <Button asChild size="lg" className="h-16 px-12 bg-primary hover:bg-primary/90 text-primary-foreground text-xl rounded-none">
              <Link href="/register">
                Request Clearance <ChevronRight className="ml-2 w-6 h-6" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-12 bg-background">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-muted-foreground" />
            <span className="font-mono text-sm text-muted-foreground">AI Brain / 2024</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground font-mono">
            <Link href="#" className="hover:text-primary transition-colors">Documentation</Link>
            <Link href="#" className="hover:text-primary transition-colors">API Status</Link>
            <Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
