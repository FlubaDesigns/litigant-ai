import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { safeNext } from "@/lib/authUtils";

/** Only displayed on the explicitly requested /sign-in?engine=1 route. */
export default function AuthorizationEngineSignIn() {
  const [, setLocation] = useLocation();
  const [request, setRequest] = useState<{ requestId: string; expiresAtMs: number } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= request.expiresAtMs) { setStatus("Session expired. Start again."); setRequest(null); return; }
      try {
        const response = await fetch("/api-server/api/auth/engine/session/" + request.requestId, { method: "POST", credentials: "same-origin", cache: "no-store" });
        if (cancelled) return;
        if (response.status === 202) { timer = setTimeout(poll, 3000); return; }
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (cancelled) return;
        await signInWithCustomToken(auth, result.customToken);
        setStatus("Signed in.");
        setLocation(safeNext(new URLSearchParams(window.location.search).get("next")));
      } catch { if (!cancelled) { setStatus("Sign-in could not complete. Start again."); setRequest(null); } }
    };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [request]);
  async function start() {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api-server/api/auth/engine/session", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error();
      setRequest(await response.json());
      setStatus("Waiting for Authorization Engine approval. Keep this page open.");
    } catch { setStatus("Authorization Engine sign-in is unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 mb-6" aria-label="Authorization Engine sign-in">
    <Button className="w-full" disabled={busy || !!request} onClick={start}>Authorize this browser</Button>
    <p role="status">{status}</p>
    {request && <p>Request: <code>{request.requestId}</code></p>}
  </section>;
}
