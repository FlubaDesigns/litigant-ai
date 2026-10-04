import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AccountSetupNotice() {
  const { setupError, retryAccountSetup, logOut } = useAuth();
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Finish account setup</h1>
        <p role="alert">{setupError}</p>
        <p className="text-sm text-muted-foreground">Your account already exists. Retry here to continue.</p>
        <Button className="w-full min-h-11" onClick={() => { void retryAccountSetup().catch(() => {}); }}>Retry setup</Button>
        <Button variant="outline" className="w-full min-h-11" onClick={() => { void logOut().catch(() => toast.error("Could not sign out. Please retry.")); }}>Sign out</Button>
      </div>
    </main>
  );
}
