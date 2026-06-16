import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Brain, ArrowRight, Mail, Loader2, LogOut } from "lucide-react";

export default function VerifyEmailPage() {
  const { resendVerification, logOut, user } = useAuth();
  const [, setLocation] = useLocation();
  const [isResending, setIsResending] = useState(false);

  // If they somehow got here but are verified, send them to session
  if (user?.emailVerified) {
    setLocation("/session");
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-background brain-grid relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <Brain className="w-8 h-8 text-primary text-primary-glow" />
            <span className="text-2xl font-bold tracking-tight text-foreground font-sans">Litigant AI</span>
          </Link>
          <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-6 border border-border relative">
            <div className="absolute inset-0 border border-primary/30 rounded-full animate-ping [animation-duration:3s]" />
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold font-sans tracking-tight mb-2">Verify Clearance</h1>
          <p className="text-muted-foreground text-center">
            A verification signal has been transmitted to your terminal.
          </p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-border p-8 rounded-xl shadow-2xl text-center space-y-6">
          <div className="p-4 bg-background/50 border border-border/50 rounded-lg">
            <p className="text-sm font-mono text-muted-foreground break-all">
              {user?.email || "Unknown Operator"}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Acknowledge the signal to activate your clearance. Return here to proceed once verified.
          </p>

          <Button
            onClick={() => window.location.reload()}
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
