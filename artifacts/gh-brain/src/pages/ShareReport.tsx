import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import {
  Brain, Target, Zap, Clock, Users, RotateCcw, ChevronDown,
  ChevronUp, ExternalLink, Share2, BookOpen, LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TEMPLATES } from "@/data/templates";

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api-server/api";

interface SharedReport {
  id: string;
  title?: string;
  question?: string;
  templateId?: string;
  confidence?: number;
  creditsUsed?: number;
  status?: string;
  finalAnswer?: string;
  debateNotes?: string;
  transcript?: string;
  caveats?: string;
  artifacts?: string;
  createdAt?: string;
  roundsCompleted?: number;
  litigantCount?: number;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function MarkdownBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
        {text}
      </pre>
    </div>
  );
}

export default function ShareReportPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDebate, setShowDebate] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shareId) { setNotFound(true); setLoading(false); return; }
    fetch(`${API_BASE}/report/${shareId}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) throw new Error("Failed to load report");
        return r.json();
      })
      .then((data) => {
        if (data) setReport(data as SharedReport);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareId]);

  // Set document title + OG meta tags
  useEffect(() => {
    if (!report) return;
    const title = report.title ?? report.question?.slice(0, 80) ?? "Shared Litigant AI Report";
    document.title = `${title} — Litigant AI`;

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("og:title", title);
    setMeta("og:description", report.finalAnswer?.slice(0, 200) ?? "Multi-AI courtroom analysis");
    setMeta("og:type", "article");
    setMeta("og:url", window.location.href);

    return () => {
      document.title = "Litigant AI";
    };
  }, [report]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">Loading report…</p>
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Report not found</h1>
          <p className="text-muted-foreground text-sm">
            This report doesn't exist, was made private, or the link is incorrect.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <Brain className="w-4 h-4" />
            Try Litigant AI
          </Button>
        </Link>
      </div>
    );
  }

  const confidenceColor =
    (report.confidence ?? 0) >= 80
      ? "text-primary"
      : (report.confidence ?? 0) >= 60
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header bar */}
      <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <Brain className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight text-sm hidden sm:inline">Litigant AI</span>
          </Link>
          <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
            Public Report
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copyLink} className="gap-1.5 text-muted-foreground">
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{copied ? "Copied!" : "Copy link"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="main">
      <section className="section">
      <div className="lgt-container">
      <div className="row">
      <div className="space-y-8">
        {/* Question */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          {report.title && (
            <h1 className="text-2xl font-bold leading-tight">{report.title}</h1>
          )}
          {report.question && (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                Question put on trial
              </p>
              <p className="text-base leading-relaxed">{report.question}</p>
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
            {typeof report.confidence === "number" && report.confidence > 0 && (
              <span className={cn("flex items-center gap-1 font-semibold", confidenceColor)}>
                <Target className="w-3.5 h-3.5" />
                {report.confidence}% confidence
              </span>
            )}
            {typeof report.creditsUsed === "number" && (
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {report.creditsUsed} credits
              </span>
            )}
            {typeof report.roundsCompleted === "number" && report.roundsCompleted > 0 && (
              <span className="flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" />
                {report.roundsCompleted} round{report.roundsCompleted !== 1 ? "s" : ""}
              </span>
            )}
            {typeof report.litigantCount === "number" && report.litigantCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {report.litigantCount} litigant{report.litigantCount !== 1 ? "s" : ""}
              </span>
            )}
            {report.templateId && (() => {
              const tpl = TEMPLATES.find((t) => t.id === report.templateId);
              return tpl ? (
                <span className="flex items-center gap-1">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  {tpl.title}
                </span>
              ) : null;
            })()}
            {report.createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDate(report.createdAt)}
              </span>
            )}
            {report.status && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  report.status === "complete"
                    ? "text-primary border-primary/30 bg-primary/10"
                    : "text-amber-400 border-amber-400/30 bg-amber-400/10"
                )}
              >
                {report.status}
              </Badge>
            )}
          </div>
        </motion.div>

        <Separator />

        {/* Final Answer */}
        {report.finalAnswer && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="space-y-3"
          >
            <h2 className="text-xs font-mono text-primary uppercase tracking-widest">
              Verdict
            </h2>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <MarkdownBlock text={report.finalAnswer} />
            </div>
          </motion.section>
        )}

        {/* Caveats */}
        {report.caveats && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="space-y-3"
          >
            <h2 className="text-xs font-mono text-amber-400 uppercase tracking-widest">
              Caveats &amp; Limitations
            </h2>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <MarkdownBlock text={report.caveats} />
            </div>
          </motion.section>
        )}

        {/* Artifacts */}
        {report.artifacts && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="space-y-3"
          >
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Artifacts
            </h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <MarkdownBlock text={report.artifacts} />
            </div>
          </motion.section>
        )}

        {/* Debate Toggle */}
        {report.debateNotes && (
          <div className="space-y-2">
            <button
              onClick={() => setShowDebate((p) => !p)}
              className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              {showDebate ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showDebate ? "Hide" : "Show"} debate notes
            </button>
            {showDebate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="rounded-xl border border-border bg-card/50 p-5"
              >
                <MarkdownBlock text={report.debateNotes} />
              </motion.div>
            )}
          </div>
        )}

        {/* Transcript Toggle */}
        {report.transcript && (
          <div className="space-y-2">
            <button
              onClick={() => setShowTranscript((p) => !p)}
              className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showTranscript ? "Hide" : "Show"} full transcript
            </button>
            {showTranscript && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="rounded-xl border border-border bg-card/50 p-5 max-h-96 overflow-y-auto"
              >
                <MarkdownBlock text={report.transcript} />
              </motion.div>
            )}
          </div>
        )}

        <Separator />

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center space-y-4"
        >
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Brain className="w-6 h-6 text-primary" />
            </div>
          </div>
          <div>
            <p className="font-bold text-lg">Don't just ask AI. Put the question on trial.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Litigant AI forces your question through structured debate, critique, synthesis, and audit
              before returning a final answer.
            </p>
          </div>
          <Link href="/register">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 font-semibold">
              Try Litigant AI free
              <ExternalLink className="w-4 h-4" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            No credit card required · 100 free credits on signup
          </p>
        </motion.div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground font-mono pb-8">
          Litigant AI outputs are not legal, financial, or medical advice.
        </p>
      </div>
      </div>
      </div>
      </section>
      </main>
    </div>
  );
}
