import { Link } from "wouter";

export function SiteFooter({ variant = "landing" }: { variant?: "landing" | "app" }) {
  return (
    <footer
      className={
        variant === "app"
          ? "border-t border-border py-4 px-6"
          : "border-t border-white/[0.06] py-10"
      }
    >
      <div
        className={
          variant === "app"
            ? "max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground"
            : "max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6"
        }
      >
        {/* Brand */}
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Litigant AI" className="h-5 w-auto opacity-60" />
          <span
            className={`font-extrabold uppercase tracking-wider ${variant === "app" ? "text-[11px]" : "text-xs opacity-60"}`}
          >
            <span style={{ color: "hsl(108 94% 50%)" }}>LITIGANT-</span>
            <span style={{ color: "hsl(38 92% 50%)" }}>AI</span>
          </span>
          <span className="font-mono text-xs text-zinc-700">© {new Date().getFullYear()}</span>
        </div>

        {/* Disclaimer */}
        <p className={variant === "app" ? "text-muted-foreground" : "text-xs text-zinc-700 text-center"}>
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
    </footer>
  );
}
