import { GuestTrialNotice } from "./GuestTrialNotice";
import { useAuth } from "@/contexts/AuthContext";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, userProfile, firebaseReady, retryAccountSetup } = useAuth();

  const showWizard =
    firebaseReady &&
    !!user &&
    userProfile !== null &&
    !userProfile.onboardingComplete;

  return (
    <>
      {/* Shared site header — edit SiteHeader.tsx to update everywhere */}
      <SiteHeader variant="app" />

      <GuestTrialNotice />

      {/* Onboarding wizard — shown once after first login */}
      {showWizard && <OnboardingWizard onComplete={retryAccountSetup} />}

      {/* Page content — sits directly in #root, backbone: body.stage > #root > main */}
      <main>{!showWizard && children}</main>

      {/* Shared footer — edit SiteFooter.tsx to update everywhere */}
      <SiteFooter variant="app" />
    </>
  );
}
