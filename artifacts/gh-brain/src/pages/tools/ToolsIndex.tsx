import { Link } from "wouter";
import { motion } from "framer-motion";
import { Brain, ChevronRight, Briefcase, Globe, TrendingUp, Code2, FileText, Scale, BookOpen, FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOOL_PAGES, TOOL_CATEGORIES } from "@/data/toolPages";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Globe, TrendingUp, Code2, FileText, Scale, BookOpen, FlaskConical, Search,
};

const CATEGORY_COLORS: Record<string, string> = {
  business: "text-primary border-primary/30 bg-primary/10",
  technical: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  personal: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  writing: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  research: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
};

export default function ToolsIndexPage() {
  usePageMeta({
    title: "AI Analysis Tools — Litigant AI | Multi-Model Adversarial Reasoning",
    description: "Free AI-powered analysis tools for business plans, websites, contracts, decisions, code reviews, and more. Multiple AI models debate and deliver a structured verdict.",
    canonicalPath: "/tools",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "AI Analysis Tools — Litigant AI",
      "url": "https://litigant-ai.com/tools",
      "description": "Free AI-powered analysis tools. Multiple AI models debate your question and deliver a confidence-scored verdict.",
      "hasPart": TOOL_PAGES.map((t) => ({
        "@type": "WebPage",
        "name": t.metaTitle,
        "url": `https://litigant-ai.com/tools/${t.slug}`,
        "description": t.metaDescription,
      })),
    },
  });

  const [activeCategory, setActiveCategory] = useState("all");

  const filtered =
    activeCategory === "all"
      ? TOOL_PAGES
      : TOOL_PAGES.filter((t) => t.category === activeCategory);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="h-14 border-b border-border/60 bg-background/95 backdrop-blur-sm sticky top-0 z-40 flex items-center px-6 gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <img src="/logo.png" alt="Litigant AI" className="w-6 h-6" />
          <span className="font-bold tracking-tight">Litigant AI</span>
        </Link>
        <nav className="flex items-center gap-4 ml-6 text-sm text-muted-foreground">
          <Link href="/tools" className="text-foreground font-medium">Tools</Link>
          <Link href="/#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="font-semibold">Try free</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-20 pb-12 max-w-4xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-block text-xs font-semibold text-primary border border-primary/30 bg-primary/10 px-3 py-1 rounded-full mb-5 tracking-wider uppercase">
            10 Free AI Analysis Tools
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Put Your Toughest Questions<br className="hidden sm:block" /> on Trial
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Each tool deploys a panel of AI models that argue, critique, and cross-examine your question from competing perspectives — delivering a confidence-scored verdict instead of a guess.
          </p>
        </motion.div>
      </section>

      {/* Category filter */}
      <div className="px-6 max-w-5xl mx-auto mb-8">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={cn(
              "text-sm px-3 py-1.5 rounded-full border transition-colors",
              activeCategory === "all"
                ? "bg-primary/10 text-primary border-primary/30 font-medium"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            All tools
          </button>
          {TOOL_CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveCategory(id)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-full border transition-colors",
                activeCategory === id
                  ? cn("font-medium border", CATEGORY_COLORS[id])
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tool grid */}
      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tool, i) => {
            const Icon = ICON_MAP[tool.icon] ?? Briefcase;
            return (
              <motion.div
                key={tool.slug}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <Link href={`/tools/${tool.slug}`}>
                  <div className="group rounded-xl border border-border/60 bg-card/40 overflow-hidden h-full hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 cursor-pointer flex flex-col">
                    <div className="relative h-36 overflow-hidden bg-card/60">
                      <img
                        src={tool.image}
                        alt={tool.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                      <div className="absolute top-2 left-2">
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", CATEGORY_COLORS[tool.category])}>
                          {tool.badge}
                        </span>
                      </div>
                      <div className="absolute top-2 right-2 w-7 h-7 rounded-md bg-background/70 backdrop-blur-sm border border-border/40 flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <h2 className="font-bold text-sm mb-1 group-hover:text-primary transition-colors">
                        {tool.title}
                      </h2>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                        {tool.metaDescription}
                      </p>
                      <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Try it free <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border/60 bg-card/20 px-6 py-16 text-center">
        <h2 className="text-2xl font-bold mb-3">Ready to start?</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          100 free credits on signup. No credit card required.
        </p>
        <Link href="/register">
          <Button size="lg" className="font-semibold gap-2">
            Create free account <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </section>
    </div>
  );
}
