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
        const response = await fetch("/api-server/api/auth/engine/session/" + request.requestId, { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (cancelled) return;
        if (response.status === 202) { timer = setTimeout(poll, 3000); return; }
        const result = await response.json().catch(() => null);
        if (!response.ok || typeof result?.customToken !== "string") throw new Error(result?.error || "Sign-in could not complete. Start again.");
        if (cancelled) return;
        await signInWithCustomToken(auth, result.customToken);
        setStatus("Signed in.");
        setLocation(safeNext(new URLSearchParams(window.location.search).get("next")));
      } catch (error) { if (!cancelled) { setStatus(error instanceof Error ? error.message : "Sign-in could not complete. Start again."); setRequest(null); } }
    };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [request]);
  async function start() {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api-server/api/auth/engine/session", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.requestId !== "string" || !Number.isFinite(result?.expiresAtMs) || result.expiresAtMs <= Date.now()) throw new Error(result?.error || "Authorization Engine sign-in is unavailable. Please try again.");
      setRequest(result);
      setStatus("Waiting for Authorization Engine approval. Keep this page open.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Authorization Engine sign-in is unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 mb-6" aria-label="Authorization Engine sign-in">
    <Button className="w-full" disabled={busy || !!request} onClick={start}>Authorize this browser</Button>
    <p role="status">{status}</p>
    {request && <p>Request: <code>{request.requestId}</code></p>}
  </section>;
}
