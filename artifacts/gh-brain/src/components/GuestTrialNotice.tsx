import { accountAccess } from "@workspace/api-zod/session";
import { Link } from "wouter";
import { useGuestInvitation } from "@/hooks/useGuestInvitation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
export function GuestTrialNotice() {
  const {userProfile} = useAuth();
  const {invitation, isGuest, ended, isError, refetch} = useGuestInvitation();
  if (!isGuest) return null;
  if (isError) return <aside className="row py-3" role="alert">Could not check trial access. <Button variant="outline" onClick={() => refetch()}>Retry</Button></aside>;
  if (!invitation) return null;
  const credits = userProfile?.creditBalance ?? invitation.remainingCredits;
  return <aside className="row py-3"><div className="lgt-card lgt-card--compact flex flex-wrap items-center justify-between gap-3" role="status">
    <div><p className="text-sm font-semibold">{ended ? "Your trial has ended" : `${accountAccess(invitation.plan).label} trial · ${credits} credits left`}</p>
    <p className="text-xs text-muted-foreground">{ended ? "Create an account to continue." : `Sign up by ${new Date(invitation.expiresAt).toLocaleString()} to keep your saved work.`}</p></div>
    <Button asChild><Link href="/register">Create account</Link></Button>
  </div></aside>;
}
