import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { reload } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, Mail, Loader2, LogOut } from "lucide-react";
import { AccountSetupNotice } from "@/components/AccountSetupNotice";
import { API_BASE } from "@/lib/apiUrl";
import { authPath, safeNext } from "@/lib/authUtils";

export default function VerifyEmailPage() {
  const { resendVerification, logOut, user, loading, setupError, retryAccountSetup } = useAuth();
  const [, setLocation] = useLocation();
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const next = safeNext(new URLSearchParams(useSearch()).get("next"));

  // Move side-effecting navigation out of the render path
  useEffect(() => {
    if (user?.emailVerified && !loading && !setupError && !isChecking) setLocation(next);
  }, [user?.emailVerified, loading, setupError, isChecking, next, setLocation]);

  async function handleVerifyCheck() {
    if (!user || isChecking || isResending || loading) return;
    setIsChecking(true);
    try {
      await reload(user);
      if (user.emailVerified) {
        await retryAccountSetup();
        // Fire welcome email exactly once (idempotent on server)
        user.getIdToken().then((token) =>
          fetch(
            `${API_BASE}/auth/welcome`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } }
          )
        ).catch(() => {});
        setLocation(next);
      } else {
        toast.error("Email not yet verified — please click the link in your inbox.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification could not be checked. Please retry.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleResend() {
    if (!user || loading || isResending || isChecking) return;
    setIsResending(true);
    try {
      await resendVerification();
      toast.success("Verification email sent.");
    } catch (error: any) {
      toast.error(error.message || "Could not send the verification email. Please retry.");
    } finally {
      setIsResending(false);
    }
  }

  if (setupError) return <AccountSetupNotice />;

  return (
    <main className="auth-main">
      <div className="auth-glow" />

      <div className="row"><div className="layout__center">
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
          <h1 className="text-4xl font-semibold font-serif tracking-tight mb-3 text-center">
            {loading ? "Checking sign-in" : user ? "Verify your email" : "Sign in to verify your email"}
          </h1>
          <p className="text-muted-foreground text-center">
            {loading ? "Please wait while we check your account." : user
              ? "Use the verification link in your inbox, then return here."
              : "Sign in to check your verification status or request another verification email."}
          </p>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8 rounded-lg shadow-2xl text-center space-y-6">
          {loading ? (
            <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking your account…
            </p>
          ) : !user ? (
            <div className="space-y-4">
              <Button asChild className="w-full min-h-11 whitespace-normal bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                <Link href={authPath("/sign-in", next)}>Sign in</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Need an account?{" "}
                <Link href={authPath("/register", next)} className="text-primary underline underline-offset-4">Create an account</Link>
              </p>
            </div>
          ) : <>
            <div className="p-4 bg-background/50 border border-border/50 rounded-lg">
              <p className="text-sm font-mono text-muted-foreground break-all">
                {user.email || "Your signed-in account"}
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              After opening the link in your email, select the button below to continue.
            </p>

            <Button
              onClick={handleVerifyCheck}
              disabled={isChecking || isResending}
              className="w-full min-h-11 whitespace-normal bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {isChecking ? "Checking verification…" : "I have verified my email"}
              <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
            </Button>

            <div className="pt-4 border-t border-border/50 space-y-2">
              <Button
                variant="outline"
                onClick={handleResend}
                disabled={isResending || isChecking}
                className="w-full min-h-11 whitespace-normal bg-transparent border-border hover:bg-secondary/50 transition-colors text-sm"
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    Sending email…
                  </>
                ) : (
                  "Resend verification email"
                )}
              </Button>
              <Button
                variant="ghost"
                disabled={isResending || isChecking}
                onClick={async () => { await logOut(); setLocation(authPath("/register", next)); }}
                className="w-full min-h-11 whitespace-normal text-muted-foreground hover:text-foreground text-sm gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Wrong email? Sign out &amp; start over
              </Button>
            </div>
          </>}
        </div>
      </div></div>
    </main>
  );
}
