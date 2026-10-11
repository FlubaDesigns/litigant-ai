import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { deleteAccount, AccountDeletionError } from "@/services/sessionService";
import { toast } from "sonner";

/** This replaces ordinary account setup while the server owns a pending deletion.
 * It works even after the profile is gone and never calls provisioning on retry. */
export function AccountDeletionRecovery() {
  const { user, logOut, accountDeletionResult } = useAuth();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AccountDeletionError | null>(null);
  const inFlight = useRef(false);
  const displayedFailure = failure ?? (accountDeletionResult ? new AccountDeletionError(accountDeletionResult) : null);
  async function retryDeletion() {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await deleteAccount(await user.getIdToken());
      await logOut().catch(() => toast.error("Account deleted, but local sign-out failed. Try signing out again."));
      toast.success("Account deleted.");
      navigate("/");
    } catch (error) {
      setFailure(error instanceof AccountDeletionError ? error : new AccountDeletionError({ success: false,
        code: "authentication_unavailable", phase: "unknown", appDataDeleted: null, authDeleted: null, retryable: false,
        message: "Deletion could not be confirmed because your sign-in is unavailable. Contact support with your account ID to check final cleanup." }));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Finish account deletion</h1>
        <p role="status">{busy ? "Deleting remaining account data and sign-in access…" : displayedFailure?.message ??
          "Account deletion was requested. Some data may already be removed. Wait for the current request to finish, then retry here if needed."}</p>
        <p className="text-sm text-muted-foreground">Deletion cannot be undone. Account setup and new conversations are unavailable while it is pending.</p>
        {displayedFailure?.result.retryable !== false && <Button disabled={busy} className="w-full min-h-11" onClick={retryDeletion}>
          {busy ? "Deleting…" : "Retry account deletion"}
        </Button>}
        <p className="text-sm text-muted-foreground">If deletion keeps failing, contact support and include your account ID: {user?.uid}</p>
        <Button disabled={busy} variant="outline" className="w-full min-h-11" onClick={() => { void logOut().catch(() => toast.error("Could not sign out. Please retry.")); }}>Sign out</Button>
      </div>
    </main>
  );
}
