# Single-source cleanup and graceful configuration failures

## Authoritative paths

- Production releases: Authorization Engine approval and `scripts/lai-release.mjs`.
  Both historical direct deployment commands exit before accessing credentials,
  building, publishing or changing cloud resources. Old deployment notes refer
  to the maintained README protocol. This does not revoke a human's existing
  cloud permissions or erase historical Git versions.
- API build: `artifacts/api-server/build.mjs` and its Dockerfile. Old build commands
  exit with directions to this build. The obsolete Firebase Functions package,
  checked-in compiled bundles and two stale source ZIPs are removed.
- Session accounting: `creditRunSettlement.ts` owns durable reservations and
  refunds; `creditLedger.ts` owns grants, purchases and manual adjustments. The
  old standalone reservation/refund implementations are removed, and their
  remaining tests now exercise durable runs.
- Credit conversion: `CREDITS_PER_DOLLAR` in the shared billing contract; usage
  accounting derives `CREDIT_VALUE_USD` from that same value.

## Failed loads

Each run reads saved Canon and seat instructions before reserving credits, then
passes that server-owned snapshot to execution. A missing, invalid, failed or
stalled Canon read returns a safe, retryable 503 with no reservation or AI call.
Canon text and version have no bundled substitute and no stale-cache fallback.
The historical overwrite seed command is disabled. No saved Canon text is changed.

Seat files are declared defaults when no saved override exists. Missing or empty
files and invalid saved overrides are errors; the engine never invents a generic
role description. Unavailable configuration databases do not substitute billing,
pricing, template, credit-pack, AI Studio or estimate-history values. Billing
reads reject malformed saved overrides. Estimate-history read failures are
reported instead of pretending the prior was successfully calibrated.

Explicit defaults for absent optional overrides and the documented estimation
prior for insufficient historical samples still have their single declared
source; they are not substitutes for failed reads. Existing explicit user choices,
such as turning Conscience off or choosing automatic model selection, are unchanged.

## Release acceptance

The descriptor is reset to inspection; previous approval cannot release this code.
Read-only cloud preflight checks that the existing saved Canon text and version
are present before application mutations. It never creates or changes that data.
Full release gates and Engine approval are still required for Main deployment.

Offline acceptance covers retired commands making no external tool calls,
configuration read errors/timeouts, missing/invalid Canon producing 503 before
credits or AI work, exact instruction snapshot handoff, duplicate-reservation and
settlement protection, account deletion fencing and shared credit pricing.
These tests do not establish authenticated production behavior.
