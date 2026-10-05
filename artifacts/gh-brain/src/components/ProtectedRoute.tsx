import { useGuestInvitation } from "@/hooks/useGuestInvitation";
import { GuestTrialNotice } from "./GuestTrialNotice";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AccountSetupNotice } from "./AccountSetupNotice";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireVerified?: boolean;
  requireAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireVerified = true,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, loading, setupError, isAdmin, firebaseReady } = useAuth();

  const trial = useGuestInvitation();

  // When Firebase is not configured, allow all access in guest mode
  if (!firebaseReady) {
    return <>{children}</>;
  }

  // Dev-only e2e bypass: ?e2e=1 skips auth so Playwright tests can access protected pages
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("e2e") === "1") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (setupError) return <AccountSetupNotice />;

  if (!user) {
    return <Redirect to={`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} />;
  }

  if (trial.isGuest && trial.ended) return <GuestTrialNotice />;
  if (trial.isGuest && ["/billing", "/settings"].includes(window.location.pathname)) return <Redirect to="/register" />;
  if (requireVerified && !trial.isGuest && !user.emailVerified && !import.meta.env.DEV) {
    return <Redirect to="/verify-email" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Redirect to="/session" />;
  }

  return <>{children}</>;
}
