import { Link } from "wouter";

declare const __BUILD_TIME__: string;

export function SiteFooter({ variant = "landing" }: { variant?: "landing" | "app" }) {
  if (variant === "app") {
    return (
      <footer className="border-t border-border py-4">
        <div className="row flex-between flex-wrap">
          <div className="flex-row">
            <img src="/logo.png" alt="Litigant AI" className="h-5 w-auto opacity-60" />
            <span className="font-extrabold uppercase tracking-wider text-[11px]">
              <span style={{ color: "hsl(108 94% 50%)" }}>LITIGANT-</span>
              <span style={{ color: "hsl(38 92% 50%)" }}>AI</span>
            </span>
            <span className="font-mono text-xs text-zinc-700">© {new Date().getFullYear()}</span>
            <span className="font-mono text-[10px] text-zinc-800" title="Build timestamp">
              v{new Date(__BUILD_TIME__).toISOString().replace("T", " ").slice(0, 16)}z
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            AI outputs are not legal, financial, or medical advice. Use judgment.
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-white/[0.06] py-10">

      {/* Row 1 — Brand + Nav links */}
      <div className="row flex-between flex-wrap">
        <div className="flex-row">
          <img src="/logo.png" alt="Litigant AI" className="h-5 w-auto opacity-60" />
          <span className="font-extrabold uppercase tracking-wider text-xs opacity-60">
            <span style={{ color: "hsl(108 94% 50%)" }}>LITIGANT-</span>
            <span style={{ color: "hsl(38 92% 50%)" }}>AI</span>
          </span>
          <span className="font-mono text-xs text-zinc-700">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex-row gap-5 text-xs font-mono text-zinc-600">
          <a href="#" className="hover:text-white transition-colors">Docs</a>
          <a href="#" className="hover:text-white transition-colors">Status</a>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms"   className="hover:text-white transition-colors">Terms</Link>
        </div>
      </div>

      {/* Row 2 — Disclaimer */}
      <div className="row">
        <p className="text-xs text-zinc-700 leading-relaxed">
          AI outputs are not legal, financial, or medical advice. Always apply human judgment before acting on any output.
        </p>
      </div>

    </footer>
  );
}
