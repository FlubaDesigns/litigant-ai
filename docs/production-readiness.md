# Production-readiness fixes and release acceptance

This change prepares the code and release controller. It does not establish that
production has changed or that the end-to-end customer journey has passed.

## Changes

- Feedback uses an authenticated API with bounded input, owner checks and a
  shared per-user hourly allowance. Direct client Firestore writes are denied.
- Uploads and URL extraction share an administrator-configured hourly allowance.
  PDF/DOCX parsing runs in disposable workers with a deadline, disconnect
  cancellation, a two-worker container ceiling and a bounded V8 heap. These are
  resource controls, not a complete native-memory sandbox. The 10 MB upload and
  12,000-character output limits remain.
- Production quota-store failures return 503 rather than multiplying allowances
  through per-instance fallback. Defaults are 60 feedback and 30 file requests
  per hour, with a 15-second extraction deadline; Admin Limits can change them.
- `/api/live` checks process liveness. `/api/health` performs a database read with
  a three-second response deadline. It does not certify AI, payments or email.
  Admin health reports degraded for unknown counts or any failed session in its
  seven-day window; this is historical failure visibility, not a current outage
  assertion.
- Manual credit adjustments use one request ID per open form. Repeating the same
  request returns its original result. Reusing an ID with different details
  returns 409. Closing/reopening creates a new adjustment: inspect the ledger
  first after an uncertain response.
- Admin AI Studio records human-reviewed responses with criterion evidence,
  source/model references and a rubric version. A sample score is not calibrated
  accuracy. Selection scores remain routing preferences. The old null-returning
  evaluation stubs are removed.
- The setup checklist now reflects Fluba-managed provider connections and live
  acceptance checks. New checklist entries start unchecked. Password sign-in and
  reset use accurate password terminology.

## Release boundary

The descriptor is reset to `inspect`: this candidate cannot deploy using stale
approval. Follow the existing exact-source CI, Main inspection, private Engine
full security gate and descriptor-only release process. No credential, IAM,
traffic, payment-catalog or customer-data migration is included.

The controller now reads the active default Firestore rules and accepts only the
pinned prior rules or the reviewed feedback-denial rules. Unexpected rules drift
or missing rules permissions stops the release before API changes. After the API
and frontend are verified, it creates the pinned ruleset and updates only the
existing `cloud.firestore` release. It rechecks the approval and active rules
before activation and verifies the resulting ruleset. Concurrent external rules
changes are unsupported; do not edit rules in another tool during this release.
A failed final rules step is an incomplete release even if API/Hosting succeeded.

The existing deployment identity must have `firebaserules.releases.get`,
`firebaserules.releases.update`, `firebaserules.rulesets.get` and
`firebaserules.rulesets.create`. The controller checks access and never grants it.

## Acceptance evidence still needed on the approved production release

1. Confirm exact API/frontend source, database readiness and active feedback rule
   hash. Confirm authenticated feedback success plus anonymous, forged-owner,
   foreign-session and over-quota rejection with dedicated test accounts.
2. Verify a real PDF and DOCX, shared URL/upload quota and graceful retry after a
   timeout. Confirm Admin Limits changes apply to new requests.
3. Verify one credit ledger entry for a retried adjustment and a conflict for
   changed details under the same ID using an approved test account.
4. Complete signup, verification-email receipt, sign-in, AI session, save and
   export. Capture release/session references without storing credentials.
5. With an explicitly approved test payment, verify checkout, webhook delivery,
   matching ledger credit, duplicate-event handling and refund/dispute procedure.
6. Review representative real model outputs across all seats and supported tasks,
   including adverse examples. Record evidence, failure rates and the assessed
   model versions before making reliability claims. No such calibration is
   implied by unit tests or hand-entered review scores.
7. Confirm production alert delivery, support ownership and a backup restore
   exercise. The source changes do not prove operational recovery.

CI runs unit/type/build/browser checks, release-boundary tests and an isolated
`demo-litigant-readiness` Firestore emulator test. The emulator confirms both
anonymous and authenticated direct feedback writes are denied and uses an
allowed owner profile write as a positive control; it cannot contact production.
