import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronRight, Check, Zap, Shield, BarChart3,
  Brain, Target, RotateCcw, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToolBySlug, ToolSampleOutput } from "@/data/toolPages";
import { usePageMeta } from "@/hooks/usePageMeta";
import { funnelTo } from "@/lib/funnel";
import NotFoundPage from "@/pages/not-found";
import { useState } from "react";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useAuth } from "@/contexts/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left border border-border/50 rounded-xl p-4 hover:border-border transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-sm">{q}</span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && <p className="mt-3 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-3">{a}</p>}
    </button>
  );
}

function DocumentPreview({ sample }: { sample: ToolSampleOutput }) {
  const confColor =
    sample.confidence >= 80 ? "#00a83a" :
    sample.confidence >= 60 ? "#b45309" : "#b91c1c";

  return (
    /* Outer container — dark page background so the white doc "floats" */
    <div className="rounded-xl overflow-hidden bg-zinc-900 p-6 sm:p-10 shadow-2xl shadow-black/60">
      {/* The white document page */}
      <div
        className="mx-auto w-full max-w-2xl rounded shadow-[0_4px_32px_rgba(0,0,0,0.35)]"
        style={{
          background: "#ffffff",
          color: "#111111",
          fontFamily: "system-ui, sans-serif",
          fontSize: "13px",
          lineHeight: "1.65",
        }}
      >
        {/* Letterhead */}
        <div
          style={{
            padding: "28px 36px 20px",
            borderBottom: "2px solid #00c853",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "15px", letterSpacing: "0.06em", color: "#111" }}>
              LITIGANT<span style={{ color: "#00c853" }}>·</span>AI
            </div>
            <div style={{ fontSize: "10px", color: "#888", marginTop: 2, fontFamily: "monospace" }}>
              Put AI to the question!
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "#aaa", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Session Report
            </div>
            <div style={{ fontSize: "10px", color: "#ccc", marginTop: 2 }}>
              {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 36px 32px" }}>

          {/* Question */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 6 }}>
              Question put on trial
            </div>
            <div style={{ background: "#f7f7f7", borderRadius: 6, padding: "12px 14px", color: "#222", fontSize: "12.5px", lineHeight: 1.6 }}>
              {sample.question}
            </div>
          </div>

          {/* Meta strip */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginBottom: 22, fontSize: "11px", color: "#666" }}>
            <span>
              Confidence:&nbsp;
              <span style={{ fontWeight: 700, color: confColor }}>
                {sample.confidence}%
              </span>
            </span>
            <span>Credits used: <strong style={{ color: "#333" }}>{sample.creditsUsed}</strong></span>
            <span>Rounds: <strong style={{ color: "#333" }}>{sample.rounds}</strong></span>
            <span>Litigants: <strong style={{ color: "#333" }}>{sample.litigants}</strong></span>
          </div>

          <div style={{ borderTop: "1px solid #e5e5e5", marginBottom: 22 }} />

          {/* Verdict */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#00a83a", marginBottom: 8, fontWeight: 700 }}>
              Verdict
            </div>
            <div style={{ borderLeft: "3px solid #00c853", paddingLeft: 14, color: "#1a1a1a", fontSize: "12.5px", lineHeight: 1.7 }}>
              {sample.verdict}
            </div>
          </div>

          {/* Caveats */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#b45309", marginBottom: 8, fontWeight: 700 }}>
              Caveats &amp; Limitations
            </div>
            <div style={{ borderLeft: "3px solid #f59e0b", paddingLeft: 14, color: "#444", fontSize: "12px", lineHeight: 1.65 }}>
              {sample.caveats}
            </div>
          </div>

          {/* Debate notes */}
          <div>
            <div style={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 8 }}>
              Debate notes
            </div>
            <div style={{ background: "#f7f7f7", borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#b45309", marginBottom: 6 }}>
                {sample.debateRole}
              </div>
              <div style={{ color: "#555", fontSize: "12px", fontStyle: "italic", lineHeight: 1.65 }}>
                "{sample.debateSnippet}"
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #ebebeb", fontSize: "10px", color: "#bbb", textAlign: "center" }}>
            Generated by Litigant AI — litigant-ai.web.app
          </div>

        </div>
      </div>
    </div>
  );
}

function useToolHrefs(templateId: string, user: ReturnType<typeof useAuth>["user"]) {
  const templateDest = `/session?templateId=${templateId}`;
  const sessionDest  = `/session`;
  const creditsDest  = `/billing`;
  if (user) {
    return { useTemplate: templateDest, askQuestion: sessionDest, getCredits: creditsDest };
  }
  return {
    useTemplate: funnelTo(templateDest).register,
    askQuestion: funnelTo(sessionDest).register,
    getCredits:  funnelTo(creditsDest).register,
  };
}

export default function ToolPage() {
  const { signupBonusCredits: signupBonus } = usePublicConfig();
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const tool = getToolBySlug(slug);
  const hrefs = useToolHrefs(tool?.templateId ?? "", user);

  usePageMeta({
    title: tool?.metaTitle ?? "Tool Not Found | Litigant AI",
    description: tool?.metaDescription,
    canonicalPath: tool ? `/tools/${tool.slug}` : undefined,
    ogImage: tool?.image,
    jsonLd: tool
      ? [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": tool.metaTitle,
            "url": `https://litigant-ai.com/tools/${tool.slug}`,
            "description": tool.metaDescription,
            "isPartOf": { "@type": "WebSite", "url": "https://litigant-ai.com" },
          },
          {
            "@context": "https://schema.org",
            "@type": "HowTo",
            "name": tool.headline,
            "description": tool.subheadline,
            "step": tool.howItWorks.map((s) => ({
              "@type": "HowToStep",
              "name": s.title,
              "text": s.desc,
              "position": parseInt(s.step, 10) || undefined,
            })),
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": tool.faqs.map((faq) => ({
              "@type": "Question",
              "name": faq.q,
              "acceptedAnswer": { "@type": "Answer", "text": faq.a },
            })),
          },
        ]
      : undefined,
  });

  if (!tool) return <NotFoundPage />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="landing" />

      <main className="main">

        {/* Hero */}
        <section className="section text-center">
          <div className="main-inner">
            <div className="row">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
                <span className="inline-block text-xs font-semibold text-primary border border-primary/30 bg-primary/10 px-3 py-1 rounded-full mb-5 tracking-wider uppercase">
                  {tool.badge}
                </span>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight">
                  {tool.headline}
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
                  {tool.subheadline}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href={hrefs.useTemplate}>
                    <Button size="lg" className="font-semibold gap-2 w-full sm:w-auto">
                      {tool.ctaLabel} <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href={hrefs.askQuestion}>
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">
                      Ask AI a question
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Hero image */}
        <section className="section">
          <div className="main-inner">
            <div className="row">
              <div className="rounded-2xl overflow-hidden border border-border/40 shadow-2xl shadow-black/40 aspect-video relative">
                <img
                  src={tool.image}
                  alt={`${tool.title} — Litigant AI`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
              </div>
            </div>
          </div>
        </section>

        {/* Credibility strip */}
        <section className="section section--bordered section--alt">
          <div className="main-inner">
            <div className="row">
              <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
                {[
                  { icon: Zap,       label: "Multi-model adversarial panel" },
                  { icon: Shield,    label: "Competing AI perspectives" },
                  { icon: BarChart3, label: "Confidence-scored verdict" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section">
          <div className="main-inner">
            <div className="row">
              <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
            </div>
            <div className="row">
              <div className="space-y-6">
                {tool.howItWorks.map((step, i) => (
                  <motion.div
                    key={step.step}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.08 }}
                    className="flex gap-5"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-mono text-xs font-bold text-primary">
                      {step.step}
                    </div>
                    <div className="pt-1">
                      <h3 className="font-semibold mb-1">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="section section--bordered section--alt">
          <div className="main-inner">
            <div className="row">
              <h2 className="text-2xl font-bold text-center mb-10">What you get</h2>
            </div>
            <div className="row">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tool.benefits.map((b, i) => (
                  <motion.div
                    key={b.title}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.06 }}
                    className="rounded-xl border border-border/50 bg-background/60 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm mb-0.5">{b.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{b.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sample output — static document preview */}
        <section className="section">
          <div className="main-inner">
            <div className="row">
              <h2 className="text-2xl font-bold text-center mb-3">What you actually get back</h2>
              <p className="text-sm text-muted-foreground text-center mb-8 max-w-xl mx-auto">
                {tool.outputSummary}
              </p>
              <DocumentPreview sample={tool.sampleOutput} />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section section--bordered section--alt">
          <div className="main-inner">
            <div className="row">
              <h2 className="text-2xl font-bold text-center mb-8">Questions</h2>
            </div>
            <div className="row">
              <div className="space-y-3">
                {tool.faqs.map((faq) => (
                  <FAQ key={faq.q} q={faq.q} a={faq.a} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTAs */}
        <section className="section text-center">
          <div className="main-inner">
            <div className="row">
              <h2 className="text-3xl font-bold mb-3">
                Ready to analyze your {tool.subject}?
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                {user
                  ? "Your credits are ready. Pick how you want to start."
                  : `${signupBonus} free credits on signup. No credit card required.`}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href={hrefs.useTemplate}>
                  <Button size="lg" className="font-semibold gap-2 w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black border-0">
                    Use Template <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href={hrefs.askQuestion}>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto font-semibold gap-2">
                    Ask AI a Question <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href={hrefs.getCredits}>
                  <Button size="lg" variant="ghost" className="w-full sm:w-auto text-muted-foreground">
                    Get Credits
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter variant="landing" />
    </div>
  );
}
