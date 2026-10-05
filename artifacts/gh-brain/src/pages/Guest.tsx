import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { startGuestTrial } from "@/services/authService";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
export default function GuestPage() {
  const [invitation] = useState(() => window.location.hash.slice(1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {user, logOut, retryAccountSetup} = useAuth();
  const [, navigate] = useLocation();
  async function start() {
    setBusy(true); setError("");
    try {
      await startGuestTrial(invitation);
      await retryAccountSetup();
      window.history.replaceState(null, "", "/guest");
      navigate("/session");
    } catch (e) {setError(e instanceof Error ? e.message : "Could not start trial.");}
    finally {setBusy(false);}
  }
  return <><SiteHeader /><main className="row"><section className="layout__center lgt-card space-y-4 my-8">
    <h1 className="text-2xl font-semibold">Your guest invitation</h1>
    <p>Try Litigant AI with the credits and access provided in your invitation. No card required.</p>
    <p className="text-sm text-muted-foreground">Use this browser to return to your trial. Create an account before it expires to keep your saved work.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!/^[A-Za-z0-9_-]{32}$/.test(invitation) ? <p>This link is incomplete. Open the full invitation you received.</p> : user && !user.isAnonymous ? <><p>You’re signed in to an existing account.</p><Button variant="outline" onClick={() => logOut()}>Sign out to use invitation</Button></> : <Button disabled={busy} onClick={start}>{busy ? "Opening trial…" : "Start trial"}</Button>}
    <p className="text-sm"><Link href="/register">Create an account</Link></p>
  </section></main><SiteFooter /></>;
}
