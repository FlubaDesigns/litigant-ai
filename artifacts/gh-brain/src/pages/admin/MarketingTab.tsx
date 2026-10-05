import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { guestFetch, type GuestInvitation } from "@/services/guestService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function invitationLink(id: string) { return `${window.location.origin}/guest#${id}`; }
export function MarketingTab() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [credits, setCredits] = useState("100");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [expiresAt, setExpiresAt] = useState(() => localDate(new Date(Date.now() + 7 * 86400_000)));
  const [createdLink, setCreatedLink] = useState("");
  const query = useQuery({queryKey: ["admin-guest-invitations"], queryFn: () => guestFetch<{invitations: GuestInvitation[]}>("/admin/guest-invitations"), retry: false});
  const create = useMutation({mutationFn: () => guestFetch<{id: string}>("/admin/guest-invitations", {method: "POST", body: JSON.stringify({label, credits: Number(credits), plan, expiresAt: new Date(expiresAt).toISOString()})}),
    onSuccess: data => {setCreatedLink(invitationLink(data.id)); setLabel(""); void qc.invalidateQueries({queryKey: ["admin-guest-invitations"]}); toast.success("Invitation created.");}, onError: (e: Error) => toast.error(e.message)});
  const revoke = useMutation({mutationFn: (id: string) => guestFetch(`/admin/guest-invitations/${id}`, {method: "DELETE"}),
    onSuccess: () => {void qc.invalidateQueries({queryKey: ["admin-guest-invitations"]}); toast.success("Invitation revoked.");}, onError: (e: Error) => toast.error(e.message)});
  async function copy(link: string) {
    setCreatedLink(link);
    try {await navigator.clipboard.writeText(link); toast.success("Link copied.");}
    catch {toast.info("Select the link below to copy it.");}
  }
  return <section aria-label="Guest invitations" className="space-y-4">
    <form className="lgt-card lgt-card--compact space-y-4" onSubmit={e => {e.preventDefault(); create.mutate();}}>
      <h3 className="text-lg font-semibold">Guest invitations</h3>
      <div className="space-y-1"><Label htmlFor="invite-label">For</Label><Input id="invite-label" placeholder="Name or label" value={label} onChange={e => setLabel(e.target.value)} maxLength={100} required /></div>
      <div className="row layout__split-2 layout--keep-columns">
        <div className="min-w-0 space-y-1"><Label htmlFor="invite-credits">Credits</Label><Input id="invite-credits" type="number" inputMode="numeric" min={1} max={100000} step={1} value={credits} onChange={e => setCredits(e.target.value)} required /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor="invite-plan">Access</Label><Select value={plan} onValueChange={v => setPlan(v as "free" | "pro")}><SelectTrigger id="invite-plan"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="free">Free</SelectItem><SelectItem value="pro">Pro</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-1 min-w-0"><Label htmlFor="invite-expiration">Expires</Label><Input className="w-full min-w-0" id="invite-expiration" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} required /><p className="text-xs text-muted-foreground">Your local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div>
      <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create link"}</Button>
      {createdLink && <div className="space-y-2"><Label htmlFor="invitation-link">Invitation link</Label><Input id="invitation-link" readOnly value={createdLink} onFocus={e => e.target.select()} /><Button type="button" variant="outline" onClick={() => copy(createdLink)}>Copy link</Button></div>}
      <p className="text-xs text-muted-foreground">One person per link. Signup before expiration keeps their saved work.</p>
    </form>
    {query.isPending && <p role="status">Loading invitations…</p>}
    {query.isError && <div role="alert"><p>Could not load invitations.</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>}
    {query.data?.invitations.length === 0 && <p className="text-sm text-muted-foreground">No invitations yet.</p>}
    <div className="row layout__split-2">{query.data?.invitations.map(invite => <article key={invite.id} aria-label={`Invitation for ${invite.label}`} className="lgt-card lgt-card--compact space-y-2 min-w-0">
      <h4 className="font-semibold break-words">{invite.label}</h4>
      <p className="text-sm">{invite.plan === "pro" ? "Pro" : "Free"} · {invite.status === "signed_up" ? `${invite.credits} trial credits` : `${invite.remainingCredits} / ${invite.credits} credits left`}</p>
      <p className="text-xs text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleString()}</p>
      <p className="text-xs capitalize">{invite.status.replace("_", " ")}</p>
      {["ready", "claimed"].includes(invite.status) && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(invitationLink(invite.id))}>Copy link</Button><Button variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(invite.id)}>Revoke</Button></div>}
    </article>)}</div>
    {!!query.data?.invitations.length && <p className="text-xs text-muted-foreground">Latest 100 invitations.</p>}
  </section>;
}
