import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Brain, History, LayoutTemplate, Settings,
  CreditCard, LogOut, Shield, Menu, X, Zap,
} from "lucide-react";

const APP_NAV = [
  { href: "/session",   label: "New Session", icon: Brain },
  { href: "/templates", label: "Templates",   icon: LayoutTemplate },
  { href: "/history",   label: "History",     icon: History },
  { href: "/billing",   label: "Credits",     icon: CreditCard },
  { href: "/settings",  label: "Settings",    icon: Settings },
];

const LANDING_NAV = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#the-bench",    label: "The Bench" },
  { href: "/#tools",        label: "Tools" },
  { href: "/#pricing",      label: "Pricing" },
];

export function SiteHeader({ variant = "landing" }: { variant?: "landing" | "app" }) {
  const [location] = useLocation();
  const { user, logOut, isAdmin, firebaseReady } = useAuth();
  const { credits, plan } = useUserProfile();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location]);

  const isSignedIn = firebaseReady && !!user;

  async function handleLogout() {
    try {
      await logOut();
      toast.success("Session terminated.");
    } catch {
      toast.error("Failed to sign out.");
    }
  }

  return (
    <>
      <header
        className={cn(
          "top-0 w-full z-50 border-b backdrop-blur-md",
          variant === "app"
            ? "sticky h-14 border-border bg-background/95"
            : "fixed h-16 border-white/[0.06] bg-[#080808]/90"
        )}
      >
        <div
          className={cn(
            "h-full flex items-center justify-between gap-4 px-6",
            variant === "app" ? "max-w-none" : "max-w-6xl mx-auto"
          )}
        >
          {/* ── Logo ── */}
          <Link
            href={variant === "app" ? "/session" : "/"}
            className="flex items-center gap-3 shrink-0 opacity-90 hover:opacity-100 transition-opacity group"
          >
            <img src="/logo.png" alt="Litigant AI" className={variant === "app" ? "h-7 w-auto" : "h-9 w-auto"} />
            <div className="flex flex-col leading-none">
              <span className={cn("font-extrabold uppercase tracking-wider", variant === "app" ? "text-xs" : "text-base")}>
                <span style={{ color: "hsl(108 94% 50%)" }}>LITIGANT-</span>
                <span style={{ color: "hsl(38 92% 50%)" }}>AI</span>
              </span>
              <span
                className="hidden sm:block text-[11px] font-mono mt-0.5"
                style={{ color: "hsl(108 94% 50% / 0.55)" }}
              >
                Put <em>it</em> to the question.
              </span>
            </div>
          </Link>

          {/* ── Desktop nav ── */}
          {variant === "app" ? (
            <nav className="hidden md:flex items-center gap-1 ml-2 flex-1">
              {APP_NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    location === href || location.startsWith(href + "/")
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    location === "/admin"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Shield className="w-4 h-4" />
                  Admin
                </Link>
              )}
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-500 flex-1">
              {LANDING_NAV.map(({ href, label }) => (
                <a key={href} href={href} className="hover:text-white transition-colors">{label}</a>
              ))}
            </nav>
          )}

          {/* ── Right side ── */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {variant === "app" ? (
              <>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-mono text-primary">
                  <Zap className="w-3 h-3" />
                  {credits} credits
                </div>
                <span className="hidden sm:inline text-xs font-mono uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5 rounded">
                  {plan}
                </span>
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  {user?.displayName?.split(" ")[0] || user?.email?.split("@")[0]}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="hidden sm:flex text-muted-foreground hover:text-destructive gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  onClick={() => setMobileOpen(!mobileOpen)}
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </>
            ) : (
              <>
                {/* CTA — hidden on mobile when menu open to avoid clutter */}
                {isSignedIn ? (
                  <Link href="/session" className="hidden sm:block">
                    <button
                      className="h-8 px-4 text-xs font-bold uppercase tracking-wide transition-all"
                      style={{ background: "hsl(38 92% 50%)", color: "#000" }}
                    >
                      Open App
                    </button>
                  </Link>
                ) : (
                  <>
                    <Link href="/sign-in" className="hidden md:block text-sm text-zinc-500 hover:text-white transition-colors">
                      Sign In
                    </Link>
                    <Link href="/register" className="hidden sm:block">
                      <button
                        className="h-8 px-4 text-xs font-bold uppercase tracking-wide transition-all"
                        style={{ background: "hsl(38 92% 50%)", color: "#000" }}
                      >
                        Start Free
                      </button>
                    </Link>
                  </>
                )}
                {/* Mobile hamburger for landing */}
                <button
                  className="md:hidden flex items-center justify-center w-9 h-9 text-zinc-400 hover:text-white transition-colors"
                  onClick={() => setMobileOpen(!mobileOpen)}
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Backdrop ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── App mobile menu ── */}
      {variant === "app" && mobileOpen && (
        <div className="fixed top-14 left-0 right-0 z-40 md:hidden border-b border-border bg-card px-4 py-3 space-y-1">
          {APP_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                location === href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                location === "/admin"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Shield className="w-4 h-4" />
              Admin
            </Link>
          )}
          <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-mono text-primary">
              <Zap className="w-3 h-3" />
              {credits} credits · {plan}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </div>
      )}

      {/* ── Landing mobile menu ── */}
      {variant === "landing" && mobileOpen && (
        <div className="fixed top-16 left-0 right-0 z-40 md:hidden border-b border-white/[0.06] bg-[#0e0e0e] px-4 py-3 space-y-1">
          {LANDING_NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors rounded-md hover:bg-white/5"
            >
              {label}
            </a>
          ))}
          <div className="pt-3 mt-2 border-t border-white/[0.06] flex flex-col gap-2">
            {isSignedIn ? (
              <Link href="/session" onClick={() => setMobileOpen(false)}>
                <button
                  className="w-full h-9 px-4 text-xs font-bold uppercase tracking-wide transition-all"
                  style={{ background: "hsl(38 92% 50%)", color: "#000" }}
                >
                  Open App
                </button>
              </Link>
            ) : (
              <>
                <Link href="/register" onClick={() => setMobileOpen(false)}>
                  <button
                    className="w-full h-9 px-4 text-xs font-bold uppercase tracking-wide transition-all"
                    style={{ background: "hsl(38 92% 50%)", color: "#000" }}
                  >
                    Start Free
                  </button>
                </Link>
                <Link href="/sign-in" onClick={() => setMobileOpen(false)}
                  className="block text-center text-sm text-zinc-500 hover:text-white transition-colors py-1"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
