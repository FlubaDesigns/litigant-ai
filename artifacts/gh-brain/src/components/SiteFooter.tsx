import { Link } from "wouter";

declare const __BUILD_TIME__: string;

export function SiteFooter({ variant = "landing" }: { variant?: "landing" | "app" }) {
  return (
    <footer className={variant === "app" ? "border-t border-border py-4" : "border-t border-white/[0.06] py-10"}>
      <div className="w-full px-6">
        <div className="row flex-between">

          {/* Brand */}
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Litigant AI" className="h-5 w-auto opacity-60" />
            <span className={`font-extrabold uppercase tracking-wider ${variant === "app" ? "text-[11px]" : "text-xs opacity-60"}`}>
              <span style={{ color: "hsl(108 94% 50%)" }}>LITIGANT-</span>
              <span style={{ color: "hsl(38 92% 50%)" }}>AI</span>
            </span>
            <span className="font-mono text-xs text-zinc-700">© {new Date().getFullYear()}</span>
            {variant === "app" && (
              <span className="font-mono text-[10px] text-zinc-800" title="Build timestamp">
                v{new Date(__BUILD_TIME__).toISOString().replace("T", " ").slice(0, 16)}z
              </span>
            )}
          </div>

          {/* Disclaimer */}
          <p className={variant === "app" ? "text-xs text-muted-foreground" : "text-xs text-zinc-700 text-center"}>
            AI outputs are not legal, financial, or medical advice. Use judgment.
          </p>

          {/* Links */}
          <div className="flex gap-5 text-xs font-mono text-zinc-600">
            <a href="#" className="hover:text-white transition-colors">Docs</a>
            <a href="#" className="hover:text-white transition-colors">Status</a>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms"   className="hover:text-white transition-colors">Terms</Link>
          </div>

        </div>
      </div>
    </footer>
  );
}
