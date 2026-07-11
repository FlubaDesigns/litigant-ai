import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SiteHeader } from "@/components/SiteHeader";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, userProfile, firebaseReady } = useAuth();
  const [wizardDismissed, setWizardDismissed] = useState(false);

  const showWizard =
    firebaseReady &&
    !!user &&
    userProfile !== null &&
    !userProfile.onboardingComplete &&
    !wizardDismissed;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Shared site header — edit SiteHeader.tsx to update everywhere */}
      <SiteHeader variant="app" />

      {/* Onboarding wizard — shown once after first login */}
      {showWizard && <OnboardingWizard onComplete={() => setWizardDismissed(true)} />}

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span><span className="text-brand-green">LITIGANT-</span><span className="text-brand-amber">AI</span> — adversarial reasoning engine</span>
          <span>AI outputs are not legal, financial, or medical advice.</span>
        </div>
      </footer>
    </div>
  );
}
