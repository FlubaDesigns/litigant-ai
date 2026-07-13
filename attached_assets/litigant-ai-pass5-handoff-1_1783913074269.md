# Litigant AI — Public-Facing Frontend Audit — Pass 5 Handoff
**Scope:** Auth pages (`Register.tsx`, `SignIn.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx`) — the last major unreviewed piece of the public surface per your "finish public side first" direction. Findings numbered 12+.
**Method:** Same standard throughout — every claim verified against actual source, exact file/line citations. Where I can't fully verify something (noted explicitly below), I'm saying so rather than guessing.

---

## Finding 12 — Unvalidated `next` Redirect Parameter Across Three Auth Pages

**Priority: Medium.** Worth fixing regardless of exploitability, cheap to fix, and I want to be upfront about what I could and couldn't verify.

**Pattern, identical in three files:**
- `Register.tsx` line 30: `const next = new URLSearchParams(location.split("?")[1] ?? "").get("next") ?? "/session";` — then used at line 48 (`setLocation(\`/verify-email?next=${encodeURIComponent(next)}\`)`) and line 60 (`setLocation(next)` after Google sign-in).
- `SignIn.tsx` line 23, same pattern — used at lines 35 and 47 after successful email/password or Google sign-in.
- `VerifyEmail.tsx` line 12, same pattern — used at lines 16 and 66 once the user's email is verified.

In all three, `next` is read directly from the URL query string with no validation that it's a safe, same-origin, relative path before being passed to `setLocation()`. This is the classic open-redirect setup: a link like `litigant-ai.com/sign-in?next=https://evil-lookalike.com` would show your real, legitimate sign-in page (correct domain, real TLS cert — nothing about it looks like phishing) but could send the user somewhere else immediately after they authenticate.

**What I verified vs. what I couldn't:** the parameter itself, and its unvalidated use, is confirmed directly in all three files. What I could *not* verify is exactly how dangerous this is in practice, because this zip doesn't include `node_modules` — I can't inspect the exact behavior of the installed `wouter` version's `setLocation`. In general, the browser's History API (which client-side routers like wouter typically use under the hood) enforces same-origin restrictions on `pushState`/`replaceState` — passing a cross-origin absolute URL usually throws a `SecurityError` rather than actually navigating there. If that's how this version behaves, a bare `next=https://evil.com` wouldn't silently redirect, though it could still throw an unhandled error and leave a legitimate user stuck on a broken page after a phishing link. I don't want to claim a confirmed working exploit I haven't actually reproduced.

**Recommended fix (cheap, removes the ambiguity either way):** validate `next` before using it — require it to start with `/` and not `//` (which browsers can interpret as protocol-relative, i.e. still cross-origin), and fall back to `/session` for anything else. A few lines, shared across all three files:
```ts
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/session";
}
```
This closes the gap regardless of what the current router version does or how it might change in a future upgrade. **Recommendation: centralize this as a shared `safeNext()` helper used by all three pages, rather than three separate copies that can drift.**

---

## Finding 13 — Password-Reset Frontend Fallback Defeats the Backend Rate Limit

**Priority: High.**

**Files:** `authService.ts` lines 92-113; `auth.ts` lines 15-34, 217-239 (rate limiters and endpoint, verified Pass 1); `ForgotPassword.tsx` lines 27-36 (calls into this).

**What the backend correctly does (verified Pass 1):** `/auth/send-password-reset` is protected by two rate limiters — 3 requests/hour per target email, 10 requests/15min per IP — and always returns the same success response regardless of whether the email exists, preventing enumeration.

**What the frontend does wrong — verified in `authService.ts` lines 98-113:**
```js
export async function sendPasswordResetEmail(email: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/auth/send-password-reset`, { ... });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[AuthService] server password reset failed, falling back to Firebase:", err);
    const { sendPasswordResetEmail: firebaseReset } = await import("firebase/auth");
    await firebaseReset(auth, email);
  }
}
```
The comment directly above this function (line 92) even states the intent: *"Falls back to Firebase's built-in sender on failure."* The problem is that a `429 Too Many Requests` response is turned into a thrown `Error` by the `if (!res.ok)` branch, which is then caught by the exact same `catch` block that handles genuine network failures — so a rate-limit rejection and a dead network connection are treated identically. The moment the backend's 3-per-email or 10-per-IP limit trips, the client silently switches to calling Firebase's own password-reset sender directly, completely outside the application's rate-limited, enumeration-safe path.

**Why this matters:** the two rate limiters in `auth.ts` were clearly built deliberately (documented, dual-dimension, Firestore-backed per the code comments verified in Pass 1) specifically to prevent reset-email abuse and flooding. This fallback makes them a soft cap rather than a real one — anyone can trigger the backend limit and keep going through Firebase directly.

**Recommended fix:** only fall back on a genuine network-level failure (the `fetch()` call itself throwing, e.g. offline/DNS failure), never on any valid HTTP response from the server — especially not 429. Better yet, remove the Firebase fallback entirely so reset delivery, rate limiting, and enumeration protection stay on one controlled path:
```ts
export async function sendPasswordResetEmail(email: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/send-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new Error("Password-reset service is temporarily unavailable.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error("Too many reset requests. Please try again later.");
    throw new Error(data.error ?? "Unable to send password-reset instructions.");
  }
}
```

---

## Finding 14 — `VerifyEmail.tsx` Triggers Navigation During Render

**Priority: Medium.**

**File:** `VerifyEmail.tsx` lines 15-18:
```js
if (user?.emailVerified) {
  setLocation(next);
  return null;
}
```

**What's wrong:** `setLocation()` is a state-changing, side-effecting call (browser history + router state), and it's invoked directly in the component body during render rather than inside `useEffect` or an event handler. React's rendering model expects render functions to stay pure/side-effect-free — calling a navigation function here can produce "Cannot update a component while rendering a different component" warnings, duplicate navigation under Strict Mode, and unpredictable behavior across router/React versions. This isn't just style — it's a real state-changing operation firing on every render where `user.emailVerified` is already true.

**Recommended fix:** move the redirect into a `useEffect`, and use the `safeNext()` helper from Finding 12 at the same time:
```tsx
useEffect(() => {
  if (user?.emailVerified) setLocation(next);
}, [user?.emailVerified, next, setLocation]);

if (user?.emailVerified) return null;
```

**Related, same file, lines 64-67:** the "I have verified my clearance" button's fallback (`window.location.reload()` when `user.emailVerified` is still false) is a full page reload rather than an explicit Firebase auth-state refresh (`reload(user)` from the Firebase SDK, then re-checking the refreshed state). Not a bug, but a rougher UX than necessary — worth cleaning up alongside the `useEffect` fix since you'll already be touching this logic.

---

## Correcting My Earlier "Confirmed Clean" Claims

Two of Pass 5's "confirmed clean" statements were premature — I'd verified the page component's own visible behavior but hadn't yet traced the full service-layer call chain underneath it.

- **`ForgotPassword.tsx`:** the page itself is still accurately non-enumerating, and the backend endpoint is still solid. But the full reset *flow* isn't clean, because the service layer it calls into (`authService.ts`) bypasses the backend's rate limiter per Finding 13. Corrected statement: *"`ForgotPassword.tsx` displays a non-enumerating success message, and the backend endpoint also returns a uniform success response. However, the frontend service's unconditional Firebase fallback bypasses the backend's password-reset rate limits and must be fixed."*
- **`VerifyEmail.tsx`:** not clean beyond the shared `next` issue — see Finding 14.

**Minor, non-security note on `Register.tsx`:** the Zod schema for the role field (`role: z.string().optional()`) accepts any string, even though the UI only offers a closed `Select`. Not a vulnerability — the backend independently validates against its own whitelist before storing (verified Pass 1) — but worth tightening the frontend schema to match the same allowed values so malformed/injected values are rejected before submission rather than relying solely on the backend catch. Low priority.

---

## Public-Side Sweep Status

With this pass, the public-facing surface is now substantively covered: `Landing.tsx` (pricing/CTA sections), `ShareReport.tsx`, `ProtectedRoute.tsx`, all four auth pages (now with 4 real findings — the shared `next` bug, the reset rate-limit bypass, and two `VerifyEmail.tsx` issues), plus the full-codebase signup-bonus sweep (Finding 11). Still technically unreviewed and lower-priority: legal pages (static content), tool pages beyond the credit-bonus grep, and a few shared components (`AppLayout.tsx`, `CourtDiagram.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`, rest of `LandingDemoPlayer.tsx`, rest of `Landing.tsx`'s 735 lines beyond pricing/CTAs). None of these are typical high-risk surface (no forms, no auth, no money), so my recommendation is to treat the public side as functionally done and move to `Admin.tsx` next, circling back to the remaining low-risk components only if you want full coverage rather than risk-prioritized coverage.

**Ready for Pass 6: `Admin.tsx`, per your original sequencing.**
