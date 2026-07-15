import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

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

      {/* Shared footer — edit SiteFooter.tsx to update everywhere */}
      <SiteFooter variant="app" />
    </div>
  );
}
