import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

// Public pages
import LandingPage from "@/pages/Landing";
import SignInPage from "@/pages/auth/SignIn";
import RegisterPage from "@/pages/auth/Register";
import ForgotPasswordPage from "@/pages/auth/ForgotPassword";
import VerifyEmailPage from "@/pages/auth/VerifyEmail";
import ToolsIndexPage from "@/pages/tools/ToolsIndex";
import ToolPage from "@/pages/tools/ToolPage";

// App pages (protected)
import SessionPage from "@/pages/app/Session";
import HistoryPage from "@/pages/app/History";
import BillingPage from "@/pages/app/Billing";
import SettingsPage from "@/pages/app/Settings";

// Admin
import AdminPage from "@/pages/admin/Admin";

// Legal
import PrivacyPolicyPage from "@/pages/legal/PrivacyPolicy";
import TermsPage from "@/pages/legal/Terms";

// Shared
import ShareReportPage from "@/pages/ShareReport";
import NotFoundPage from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && user.emailVerified) return <Redirect to="/session" />;
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
      {/* Public */}
      <Route path="/" component={LandingPage} />
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

      {/* Protected app pages — wrapped with shared AppLayout */}
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
      {/* Public SEO tool pages */}
      <Route path="/tools" component={ToolsIndexPage} />
      <Route path="/tools/:slug" component={ToolPage} />
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
          <AppRoutes />
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
