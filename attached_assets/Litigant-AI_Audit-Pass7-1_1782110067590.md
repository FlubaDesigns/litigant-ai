# Litigant AI — Audit Handoff, Pass 7 of N
**Scope of this pass:** First frontend pass. `App.tsx`'s real route table and `ProtectedRoute.tsx`'s gate logic (to establish ground truth on what's actually reachable in production before reading anything else), then all four auth pages (`SignIn.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx`) and the security-sensitive parts of `Settings.tsx`. Focus this pass, per request: production-reachable routes specifically — what an unauthenticated visitor can actually hit, not just what exists in the codebase.

**Status:** Backend (`lib/` + all of `routes/`) fully read across Passes 1–6. Frontend: this pass plus prior targeted line-checks. Not yet read: `Session.tsx`, `History.tsx`, `Billing.tsx`, the rest of `Settings.tsx` (the non-security-sensitive sections — preferences, notifications, data export), `Admin.tsx`'s frontend half, `ShareReport.tsx` in full (only specific lines checked in Pass 6), `Landing.tsx`, the tools pages, and shared components.

---

## Production route map, confirmed from `App.tsx`
Public, no auth required: `/`, `/sign-in`, `/register`, `/forgot-password`, `/verify-email`, `/report/:shareId`, `/tools`, `/tools/:slug`.
Protected — requires login **and** a verified email: `/session`, `/session/:sessionId`, `/history`, `/billing`, `/settings`. (Corrected from the first version of this pass — see Finding #23.)
Admin-only (additionally requires login, verified email, and the admin claim): `/admin`.

This pass covers the public auth pages plus the security-sensitive half of the protected `/settings` page.

---

## Finding #20 — Signup still advertises a $19/mo subscription the backend cannot deliver — confirmed still live in this upload

**Severity: High. Public, unauthenticated, first-impression page. Not new in concept, but re-verified fresh against this specific zip rather than assumed.**

### Where
`artifacts/gh-brain/src/pages/auth/Register.tsx`, the `PLANS` array and the `onSubmit` branch that routes a "Starter" selection to `/billing`; combined with `artifacts/api-server/src/routes/billing.ts`'s `GET /billing/subscription` and `artifacts/api-server/src/lib/creditPacks.ts`.

### What's broken
```ts
const PLANS = [
  { id: "free" as const, name: "Free", price: "$0", credits: "100 credits", features: [...] },
  {
    id: "starter" as const,
    name: "Starter",
    price: "$19/mo",
    credits: "500 credits",
    features: ["Unlimited sessions", "Up to 10 litigants", "All export formats", "Custom personas"],
  },
];
...
if (values.plan === "starter") {
  setLocation("/billing");
} else {
  setLocation(`/verify-email?next=${encodeURIComponent(next)}`);
}
```
I re-checked the backend fresh rather than assume anything carried over from prior context: `billing.ts`'s `GET /billing/subscription` still unconditionally returns `{ subscription: null }`, `POST /billing/cancel-subscription` still returns `501`, and `creditPacks.ts` still defines exactly three products, all with `recurring: null`. There is no $19/mo product, no subscription system, no way to get "unlimited sessions" anywhere on the backend. A new user who deliberately picks "Starter" — the more expensive, more-featured-sounding option, presented right at signup — completes registration and is routed toward `/billing`, but doesn't land there directly: per Finding #23 below, `/billing` requires a verified email, so the actual journey is Register → (redirected to) `/verify-email` → verify → *then* `/billing`, where they find none of what was promised. The extra step doesn't change whether the gap is real, only when the user actually discovers it.

### What's changed since this was last looked at
The feature copy is slightly different than before ("Up to 10 litigants" instead of "4 AI models") — worth noting only because it means this is being actively edited, not dead code nobody's touched, which makes the gap more likely to surface to a real user soon rather than less.

### What I'd want before fixing this
Same as before: remove the Starter option from signup until a real subscription system exists (cheapest, most honest fix), relabel it as a real one-time pack, or build actual subscription billing. This is a product decision about what you're selling and when, not a code-correctness call I should make unilaterally.

---

## Finding #21 — Password length minimum is inconsistent between signup and change-password, still live in this upload

**Severity: Low. Re-verified, not newly discovered.**

### Where
`artifacts/gh-brain/src/pages/auth/Register.tsx`: `password: z.string().min(8, "Password must be at least 8 characters")`.
`artifacts/gh-brain/src/pages/app/Settings.tsx`, `handleChangePassword()`: `if (newPassword.length < 6) { toast.error("Password must be at least 6 characters."); return; }`.

### What's broken
An account is required to set an 8-character password at signup, but the same account can later weaken its own password to 6 characters via Settings, since that's the only check applied there. Not severe on its own — Firebase Auth's own server-side minimum is typically 6 characters regardless, so this can't be used to set something Firebase would reject outright — but it's a real, easy-to-fix policy inconsistency.

### What I'd want before fixing this
One-line change: `newPassword.length < 6` → `newPassword.length < 8`, matching the signup schema. No design decision blocking this one.

---

## Finding #22 (informational, not a defect) — `ForgotPassword.tsx` has a frontend fallback that likely mitigates Pass 4's Finding #9 for this specific page, but doesn't fix the underlying backend route

**This refines Pass 4's Finding #9 rather than contradicts it — important distinction below.**

### What I found
Pass 4 flagged `POST /auth/send-password-reset` (the backend route) as potentially leaking account existence via differing error behavior, with the caveat that I couldn't verify Firebase Admin SDK's `generatePasswordResetLink` actually throws differently for a nonexistent user. That finding was scoped to the backend route in isolation — I hadn't yet read the frontend code that actually calls it.

This pass, reading `authService.ts`'s `sendPasswordResetEmail()` (the function `ForgotPassword.tsx` actually calls, via `AuthContext.tsx`'s `resetPassword` alias), surfaced something Pass 4 couldn't have known about:
```ts
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
This function tries the backend route first, and if it fails **for any reason** — including, plausibly, the exact "nonexistent email throws" behavior Pass 4 flagged — it silently falls back to calling Firebase's **client-side** `sendPasswordResetEmail`, which is well-documented standard behavior to be uniform regardless of account existence (this is a more confidently-verifiable claim than the Admin SDK behavior Pass 4 couldn't confirm, since it's the deliberately-designed, widely-relied-upon behavior of that specific client function). If the backend throws because the account doesn't exist, but the client-side fallback still succeeds, `ForgotPassword.tsx`'s `onSubmit` never sees an error at all — `isSubmitted` becomes `true` and the user sees the uniform success message regardless of whether the email had an account.

### Why this matters and why it doesn't fully resolve Pass 4's Finding #9
This is good news for the one frontend page that goes through this path — the actual end-user-visible behavior on `/forgot-password` is likely more protected against enumeration than a backend-only reading would suggest. But it doesn't fix the underlying issue Pass 4 identified: the **raw API endpoint**, `POST /auth/send-password-reset`, is unchanged and would still exhibit whatever distinguishing behavior it has for any *other* caller — a different client, a mobile app, or anyone hitting the API directly rather than through this specific frontend page and its fallback layer. Pass 4's recommended fix (catch `auth/user-not-found` specifically in the backend route and respond uniformly regardless) is still worth doing — it closes the gap at the actual source rather than relying on this frontend page's fallback behavior as the only protection, which a different caller wouldn't benefit from.

One more thing worth flagging about this fallback itself, separate from the enumeration question: it catches *any* backend failure indiscriminately, not just the specific "account doesn't exist" case — a real backend outage, a Resend API failure, anything — and silently retries via a completely different mechanism (the Firebase client SDK directly) rather than surfacing the failure. This could mask a genuine operational problem (you'd see no errors reported from this path even during a real backend outage, since the fallback would likely still succeed), and it's a second possible double-send path if the backend partially succeeded (e.g., sent the email) before the response failed to reach the client. Not flagging this as a defect requiring an immediate fix, just noting it's worth knowing about if password-reset deliverability or duplicate-email complaints ever come up — the actual cause might be this fallback firing, not the backend route itself.

---

## Finding #23 — The route map in the first version of this pass understated `ProtectedRoute.tsx`: every protected route requires a verified email, not just a login

**Severity: Medium, as a documentation/accuracy gap rather than a code defect — flagged correctly by review, not something I should have left out given that I'd already read the file this pass.**

### Where
`artifacts/gh-brain/src/components/ProtectedRoute.tsx`, combined with `App.tsx`'s `ProtectedWithLayout` wrapper.

### What I got wrong in the first version of this pass
I described the protected routes as "redirects to `/sign-in` if not authenticated" and stopped there. I had already read the full file this same pass — the gap was in what I surfaced in the summary, not in what I'd looked at. The actual gate has three sequential checks, not one:
```ts
if (!user) {
  return <Redirect to="/sign-in" />;
}

if (requireVerified && !user.emailVerified && !import.meta.env.DEV) {
  return <Redirect to="/verify-email" />;
}

if (requireAdmin && !isAdmin) {
  return <Redirect to="/session" />;
}
```
`requireVerified` defaults to `true`. I checked `App.tsx`'s `ProtectedWithLayout` wrapper specifically to see whether any route opts out of that default — its own type signature only accepts a `requireAdmin` prop, with no way to pass `requireVerified` through it at all. Every route wrapped by it (`/session`, `/session/:sessionId`, `/history`, `/billing`, `/settings`, `/admin`) gets the default with zero exceptions. So "authenticated" was never the actual bar for any of these routes — "authenticated and verified" was, for all of them, always.

### Why this matters beyond just correcting a route table
This isn't only a documentation nitpick — it changes the accurate description of Finding #20's user journey. I checked `authService.ts`'s `signUp` function specifically: it does nothing special with verification status, meaning a freshly-registered account is unverified by Firebase's own default behavior. So immediately after `Register.tsx` calls `signUp(...)` and attempts to route a "Starter" selection to `/billing`, all three conditions for the verification redirect are already met in a real production build (`requireVerified` defaults true, `user.emailVerified` is false, `import.meta.env.DEV` is false). The actual flow is Register → redirected to `/verify-email` → verify → only then `/billing`, not a direct Register → Billing path. The underlying bug in Finding #20 (the Starter plan doesn't exist on the backend) is unaffected by this correction — but *when* a user actually discovers that gap is one step later than I'd originally described, which matters if anyone's trying to reproduce this flow or trace it through analytics/support tickets.

### Why I'm not treating this as a defect
Requiring email verification before granting access to billing, session history, and account settings is a reasonable, deliberate product choice — there's nothing here suggesting the gate itself is a bug. The only thing that needed fixing was my own description of it.

---

## What I verified and found clean this pass

- **`App.tsx`'s route table and `ProtectedRoute.tsx`'s gate logic** — read both specifically to establish what's actually reachable before trusting filenames or assumptions. `/sign-in` and `/register` correctly redirect already-authenticated users away via `RedirectIfAuthed`; `/forgot-password` and `/verify-email` don't have that wrapper, which is appropriate (no reason to block a signed-in user from those). `requireAdmin` on `/admin` checks the real `isAdmin` flag, which is itself sourced from the verified token claim, not anything client-spoofable.
- **`ProtectedRoute.tsx`'s `if (!firebaseReady) return children` fallback** — re-examined this specifically because it looked concerning on its own (client-side bypass of all route protection, including `/admin`, if Firebase isn't configured). Traced the actual consequence: the backend's `requireAdmin` middleware independently re-verifies the real token server-side regardless of what the frontend renders, and would return `503` if Firebase isn't configured server-side too (the much more likely real-world failure mode, since both sides are probably driven by the same env vars). So the realistic worst case is a confusing, broken-looking admin UI shell with no actual data exposure, not a real bypass. Worth a code comment for future maintainers, not a vulnerability.
- **`SignIn.tsx`** — `next` redirect param confirmed to use wouter's client-side `setLocation`, not `window.location.href`, so it can't be used for an off-site open redirect (consistent with what's been verified about this pattern in other auth pages previously). Error messages from `signIn`/`signInGoogle` pass through whatever Firebase's client SDK throws — I believe modern Firebase Auth deliberately consolidates wrong-password and no-such-account into one generic error specifically to avoid enumeration, but flagging that I can't execute this against a live Firebase project from this sandbox to confirm with certainty.
- **`VerifyEmail.tsx`** — the `if (user?.emailVerified) { setLocation(next); return null; }` check still runs directly in the render body rather than a `useEffect`. Previously noted as a React anti-pattern with no evidence of an actual user-facing bug; still true here, still not escalating it.
- **`Settings.tsx`'s `handleUpdateEmail`/`handleChangePassword`** — both correctly require Firebase reauthentication before the sensitive change, and both map specific Firebase error codes to safe, non-leaking messages rather than surfacing raw SDK errors.
- **`Settings.tsx`'s `handleDeleteAccount`** — confirmed the deliberate two-step ordering (Firestore data deleted first via the server, Firebase Auth account deleted only after that succeeds) is unchanged and still correctly explained in the code's own comments.

---

## Where to pick this up next
The rest of `Settings.tsx` (preferences, notifications, data export — lower-stakes sections not covered this pass), then `Session.tsx`, `History.tsx`, `Billing.tsx` as planned for the next pass, focusing on the same "what's actually production-reachable and user-facing" lens this pass used.
