import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Public pages
import LandingPage from "@/pages/Landing";
import SignInPage from "@/pages/auth/SignIn";
import RegisterPage from "@/pages/auth/Register";
import ForgotPasswordPage from "@/pages/auth/ForgotPassword";
import VerifyEmailPage from "@/pages/auth/VerifyEmail";

// App pages (protected)
import SessionPage from "@/pages/app/Session";
import TemplatesPage from "@/pages/app/Templates";
import HistoryPage from "@/pages/app/History";
import BillingPage from "@/pages/app/Billing";
import SettingsPage from "@/pages/app/Settings";

// Admin
import AdminPage from "@/pages/admin/Admin";

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

      {/* Protected app pages */}
      <Route path="/session">
        <ProtectedRoute>
          <SessionPage />
        </ProtectedRoute>
      </Route>
      <Route path="/session/:sessionId">
        <ProtectedRoute>
          <SessionPage />
        </ProtectedRoute>
      </Route>
      <Route path="/templates">
        <ProtectedRoute>
          <TemplatesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute>
          <HistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/billing">
        <ProtectedRoute>
          <BillingPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </Route>

      {/* Admin */}
      <Route path="/admin">
        <ProtectedRoute requireAdmin>
          <AdminPage />
        </ProtectedRoute>
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
