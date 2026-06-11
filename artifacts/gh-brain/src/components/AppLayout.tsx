import { Link, useLocation } from "wouter";
import { Brain, History, LayoutTemplate, Settings, CreditCard, LogOut, Shield, Menu, X, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/session", label: "New Session", icon: Brain },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/history", label: "History", icon: History },
  { href: "/billing", label: "Credits", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logOut, isAdmin } = useAuth();
  const { credits, plan } = useUserProfile();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try {
      await logOut();
      toast.success("Session terminated.");
    } catch {
      toast.error("Failed to sign out.");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <header className="h-14 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50 flex items-center px-4 gap-4">
        <Link href="/session" className="flex items-center gap-2 shrink-0 group">
          <Brain className="w-5 h-5 text-primary group-hover:text-primary-glow transition-all" />
          <span className="font-bold tracking-tight hidden sm:inline">AI Brain</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => (
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

        <div className="ml-auto flex items-center gap-3">
          {/* Credit chip */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-mono text-primary">
            <Zap className="w-3 h-3" />
            {credits} credits
          </div>

          {/* Plan badge */}
          <span className="hidden sm:inline text-xs font-mono uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5 rounded">
            {plan}
          </span>

          {/* Avatar / name */}
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
            Out
          </Button>

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-b border-border bg-card px-4 py-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
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

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>AI Brain — adversarial reasoning engine</span>
          <span>AI outputs are not legal, financial, or medical advice.</span>
        </div>
      </footer>
    </div>
  );
}
