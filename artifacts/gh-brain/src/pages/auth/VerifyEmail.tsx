import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, Mail, Loader2, LogOut } from "lucide-react";

export default function VerifyEmailPage() {
  const { resendVerification, logOut, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [isResending, setIsResending] = useState(false);
  const next = new URLSearchParams(location.split("?")[1] ?? "").get("next") ?? "/session";

  // If they somehow got here but are verified, send them on
  if (user?.emailVerified) {
    setLocation(next);
    return null;
  }

  async function handleResend() {
    setIsResending(true);
    try {
      await resendVerification();
      toast.success("Verification signal re-transmitted.");
    } catch (error: any) {
      toast.error(error.message || "Failed to re-transmit signal.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="auth-shell bg-background relative overflow-hidden">
      <div className="auth-glow" />

      <div className="auth-inner">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Litigant AI" className="w-9 h-9" />
            <span className="text-xl font-extrabold uppercase tracking-wider">
              <span className="text-brand-green">LITIGANT-</span><span className="text-brand-amber">AI</span>
            </span>
          </Link>
          <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-6 border border-border relative">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-semibold font-serif tracking-tight mb-3">Verify Clearance</h1>
          <p className="text-muted-foreground text-center">
            A verification signal has been transmitted to your terminal.
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg shadow-2xl text-center space-y-6">
          <div className="p-4 bg-background/50 border border-border/50 rounded-lg">
            <p className="text-sm font-mono text-muted-foreground break-all">
              {user?.email || "Unknown Operator"}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Acknowledge the signal to activate your clearance. Return here to proceed once verified.
          </p>

          <Button
            onClick={() => {
              if (user?.emailVerified) { setLocation(next); } else { window.location.reload(); }
            }}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            I have verified my clearance
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>

          <div className="pt-4 border-t border-border/50 space-y-2">
            <Button
              variant="outline"
              onClick={handleResend}
              disabled={isResending}
              className="w-full bg-transparent border-border hover:bg-secondary/50 transition-colors text-sm"
            >
              {isResending ? (
                <>
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                  Re-transmitting...
                </>
              ) : (
                "Re-transmit verification signal"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => { await logOut(); setLocation("/register"); }}
              className="w-full text-muted-foreground hover:text-foreground text-sm gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              Wrong email? Sign out &amp; start over
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
