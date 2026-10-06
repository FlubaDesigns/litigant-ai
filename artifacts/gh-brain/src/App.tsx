import { lazy, Suspense } from "react";
import { safeNext } from "@/lib/authUtils";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AccountSetupNotice } from "@/components/AccountSetupNotice";
import { AppLayout } from "@/components/AppLayout";

// Public pages
const GuestPage = lazy(() => import("@/pages/Guest"));
const LandingPage = lazy(() => import("@/pages/Landing"));
const SignInPage = lazy(() => import("@/pages/auth/SignIn"));
const RegisterPage = lazy(() => import("@/pages/auth/Register"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPassword"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/VerifyEmail"));
const TemplatePage = lazy(() => import("@/pages/templates/TemplatePage"));

// App pages (protected)
const SessionPage = lazy(() => import("@/pages/app/Session"));
const TemplatesPage = lazy(() => import("@/pages/app/Templates"));
const HistoryPage = lazy(() => import("@/pages/app/History"));
const BillingPage = lazy(() => import("@/pages/app/Billing"));
const SettingsPage = lazy(() => import("@/pages/app/Settings"));

// Admin
const AdminPage = lazy(() => import("@/pages/admin/Admin"));

// Legal
const PrivacyPolicyPage = lazy(() => import("@/pages/legal/PrivacyPolicy"));
const TermsPage = lazy(() => import("@/pages/legal/Terms"));

// Shared
const ShareReportPage = lazy(() => import("@/pages/ShareReport"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));


function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading, setupError } = useAuth();
  if (loading) return null;
  if (user?.isAnonymous) return <>{children}</>;
  if (setupError) return <AccountSetupNotice />;
  if (user) {
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    return <Redirect to={user.emailVerified ? next : `/verify-email?next=${encodeURIComponent(next)}`} />;
  }
  return <>{children}</>;
}

function ProtectedWithLayout({ children, requireAdmin }: { children: React.ReactNode; requireAdmin?: boolean }) {
  return (
    <ProtectedRoute requireAdmin={requireAdmin}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/app/session/:sessionId">{params => <Redirect to={`/session/${encodeURIComponent(params.sessionId)}`} />}</Route>
      {/* Public */}
      <Route path="/" component={LandingPage} />
      <Route path="/guest" component={GuestPage} />
      <Route path="/sign-in">
        <RedirectIfAuthed>
          <SignInPage />
        </RedirectIfAuthed>
      </Route>
      <Route path="/register">
        <RedirectIfAuthed>
          <RegisterPage />
        </RedirectIfAuthed>
      </Route>
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/report/:shareId" component={ShareReportPage} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/terms" component={TermsPage} />

      <Route path="/session">
        <ProtectedWithLayout>
          <SessionPage />
        </ProtectedWithLayout>
      </Route>
      <Route path="/session/:sessionId">
        <ProtectedWithLayout>
          <SessionPage />
        </ProtectedWithLayout>
      </Route>
      <Route path="/tools"><Redirect to={`/templates${window.location.search}`} /></Route>
      <Route path="/tools/:slug">{params => <Redirect to={`/templates/${encodeURIComponent(params.slug)}${window.location.search}`} />}</Route>
      <Route path="/templates" component={TemplatesPage} />
      <Route path="/templates/:slug" component={TemplatePage} />
      <Route path="/history">
        <ProtectedWithLayout>
          <HistoryPage />
        </ProtectedWithLayout>
      </Route>

      <Route path="/billing">
        <ProtectedWithLayout>
          <BillingPage />
        </ProtectedWithLayout>
      </Route>
      <Route path="/settings">
        <ProtectedWithLayout>
          <SettingsPage />
        </ProtectedWithLayout>
      </Route>

      {/* Admin */}
      <Route path="/admin">
        <ProtectedWithLayout requireAdmin>
          <AdminPage />
        </ProtectedWithLayout>
      </Route>

      <Route component={NotFoundPage} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Suspense fallback={<div role="status" className="p-8 text-center">Loading…</div>}><AppRoutes /></Suspense>
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
