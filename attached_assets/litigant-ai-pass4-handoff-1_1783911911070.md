# Litigant AI — Public-Facing Frontend Audit — Pass 4 Handoff
**Scope:** Public/unauthenticated-facing surface: `Landing.tsx`, `ShareReport.tsx`, auth pages, tool pages, legal pages, shared components (`ProtectedRoute.tsx`, `AppLayout.tsx`, `CourtDiagram.tsx`, `LandingDemoPlayer.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`), plus a full-codebase sweep for every signup-bonus reference. Admin frontend (`Admin.tsx`) intentionally deferred to Pass 5 per your request.
**Method:** Same standard throughout — every claim verified against actual source, exact file/line citations, nothing inferred.

---

## Finding 11 (supersedes/consolidates Findings 1 & 5) — The Signup Bonus Mismatch Spans the Entire Customer Journey

**Priority: Critical.** This started in Pass 1 as a 5-file documentation drift question. It is now a customer-facing, top-of-funnel inconsistency, and the evidence has shifted toward 750 being the deliberately-adopted (if incompletely propagated) value.

**Correction on completeness:** an earlier version of this finding called its count "exhaustive." It wasn't — a follow-up sweep found four more real references, including one I had actually already surfaced in Pass 1 (`billing.ts` L35) and then dropped when consolidating into this table, plus a new customer-facing email. Counting these precisely by file/line/occurrence is less useful than the coordinated-fix scope below — the number of individual references matters less than making sure every category of surface gets updated together.

### Every verified reference found so far

**Says "100" — real user-facing copy (11 references across 6 pages/components):**
`Landing.tsx` (L127, L131, L342, L700, L708 — pricing table, hero CTA, final CTA), `Register.tsx` (L80, L89), `ShareReport.tsx` (L378), `ToolPage.tsx` (L256), `ToolsIndex.tsx` (L166), `LandingDemoPlayer.tsx` (L290).

**Says "100" — comments only, not user-visible (6 references across 5 files):**
`creditLedger.ts` (L15, L39), `auth.ts` (L56), `billing.ts` (L35), `authService.ts` (L20, frontend service comment on the `/auth/provision` flow), `billingService.ts` (L118, frontend service comment on `/billing/signup-grant`), `docs/credits.md` (L208).

**Says "750" — three independent, deliberate production indicators (not one):**
1. `creditLedger.ts` L246 — the actual granting code.
2. `brain.ts` L318 — live guest-to-signup conversion message: *"you'll receive 750 credits."*
3. `emailService.ts` L57 — live HTML verification email sent to every new signup: *"unlock your **750 free credits** to get started."*

**Correctly excluded (unrelated "100" values — the accurate $0.01/credit exchange rate, not the signup bonus):** `billingService.ts` L205, `creditPacks.ts` L29, `brain.ts` L53, `billing.ts` L215, `Landing.tsx` L596, `Billing.tsx` L763.

**Also excluded from the production fix scope:** `artifacts/mockup-sandbox/` contains the same "100 credits" copy in two landing-page design variants (`IntelligenceFeed.tsx`, `VerdictTheatre.tsx`) — confirmed present, but this is a design-exploration directory outside the live production path this audit covers. Worth a one-line mention to whoever maintains those mockups, not part of the coordinated fix.

### Why the evidence now favors 750 as the intended value

Three independent, deliberately-written pieces of production copy all say 750: the granting code itself, the guest-conversion paywall message, and the verification email. It's far less likely that three unrelated pieces of copy would all land on the same unusual, non-round number (750) by separate accidents than that someone made one deliberate decision to raise the bonus from 100 to 750 — plausibly to boost conversion — and updated the backend granting logic plus the two customer-facing messages closest to the actual signup moment, but never propagated the change to the top-of-funnel marketing pages (`Landing.tsx`, `Register.tsx`, `ShareReport.tsx`, the tool pages, the demo player) or any of the internal comments/docs.

**This still needs your explicit decision — I'm weighting evidence, not making the call.** The final amount is a cost/acquisition-strategy decision I can't determine from source code alone. But if you don't already have a strong view, the evidence now leans toward 750 being current intent, with the marketing-facing "100" references being what's stale.

### Corrected remediation scope

Not a fixed "N-location" change — the right framing is a **repository-wide coordinated update**, covering every category:
- Landing page pricing and CTA copy
- Registration page
- Public shared-report CTA
- Tool pages
- Landing demo CTA
- Verification email
- Guest-session-limit response
- Frontend auth/billing service comments
- Backend auth/billing route comments
- Credit ledger comments and granting logic
- Credit-system documentation

Whichever number you choose, this should land in one commit so the entire customer journey — marketing, registration, guest paywall, verification email, and actual grant — agrees.

---

## Other Findings This Pass

### `ProtectedRoute.tsx` — Confirmed Clean
Client-side route gate only; real enforcement is server-side (`requireAdmin`, verified Pass 1). The `firebaseReady === false` → allow-all behavior (previously known) is confirmed still present but low-risk — only reachable when Firebase itself is down, in which case the app doesn't function anyway. The e2e test bypass (`import.meta.env.DEV`) is statically eliminated by Vite in production builds, not a live bypass.

### `ShareReport.tsx` — Otherwise Clean
Beyond the signup bonus line (Finding 11), this page is well-built: renders all content via `<pre>` with no `dangerouslySetInnerHTML`, no XSS surface, doesn't expose anything beyond what `report.ts`'s server-side field allowlist already scopes (verified Pass 1). OG meta tags set correctly for link previews.

### Credit Pack Pricing on `Landing.tsx` — Confirmed Consistent
The three purchasable pack tiers ($4.99→500 credits, $19.99→2,200 credits, $34.99→4,200 credits, lines 140-179) match `creditPacks.ts`'s `CREDIT_PACKS` exactly (unit_amount 499/1999/3499 cents, creditAmount 500/2200/4200). No mismatch here — only the free trial bonus is inconsistent.

---

## Not Yet Audited (queued for next pass)
- `Register.tsx`, `SignIn.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx` — only grepped for the credit-bonus string, not fully reviewed for auth flow correctness/security.
- `legal/PrivacyPolicy.tsx`, `legal/Terms.tsx` — not reviewed (lower priority, static content).
- `tools/ToolPage.tsx`, `tools/ToolsIndex.tsx` — only grepped for the credit-bonus string, not fully reviewed.
- `AppLayout.tsx`, `CourtDiagram.tsx`, `LandingDemoPlayer.tsx` (beyond the one line found), `SiteHeader.tsx`, `SiteFooter.tsx` — not yet reviewed.
- `Landing.tsx` itself — only the pricing section and CTAs were reviewed for this pass's specific question; the rest of its 735 lines (feature sections, testimonials, FAQ accordion) not yet reviewed.
- `Admin.tsx` (~2,660 lines) — deferred to Pass 5 per your instruction to finish the public side first.
