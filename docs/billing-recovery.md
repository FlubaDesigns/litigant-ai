# Billing recovery and release requirements

## Credit runs

`credit_runs/{runId}` is server-only (covered by the existing default-deny Firestore rules). Each request has a new run ID, even when continuing an existing session.

- Start: atomically reserve the full execution cap, write the usage/reservation ledger row, and create an `active` run. The estimate remains the minimum-funding start check. Existing courtesy/debt ceilings and cap overage absorption are unchanged.
- Persist: atomically save the access-filtered session result and move the run to `pending` with the requested final charge. A successful result's target cannot be replaced by a late error handler.
- Settle: atomically refund the unused allowance, write the refund row, mark the run `settled`, and update the same run's saved financial fields. Retrying cannot refund twice.
- Failure/cancellation: preserve the existing full-refund policy for the current run. Previous continuation usage is unchanged. Paid cancelled content is saved; Free records retain financial metadata only.
- Crashed worker: an `active` reservation has a 15-minute lease, longer than the 10-minute execution timeout. Recovery refunds it only after that lease expires. An expired worker cannot save a success or overwrite a successor's record. Legacy missing-session reservations are eligible for controlled admin refund only with a valid timestamp older than the same lease window.

Recovery runs on authenticated billing history/status reads, before another run, before account deletion, and before an admin refund. There is no background scheduler in this change. Pending obligations retry on those requests; inactive users' orphan reservations recover when they next return. A storage outage preserves the obligation and surfaces an error rather than claiming success.

Pending result fields distinguish usage from unavailable allowance:

- `creditsUsed`: cumulative expected final usage charge
- `creditsDebited`: cumulative debit including a hold awaiting settlement
- `creditsReserved`: still-held allowance to be returned
- `settlementStatus`: `pending` or `settled`

Once settled, `creditsReserved` is zero and `creditsDebited` equals `creditsUsed`. Billing labels the available balance and reservation rows explicitly. Completion emails honor the canonical nested preference (including false), with legacy fallback only when absent. Shortage emails use a transactionally coherent balance only when no runs hold credits. New Auto Top-Up attempts also defer while any run is active or pending.

## Auto Top-Up

Verified FAILED/CANCELED events settle existing authorizations and disable new automatic charges. Completed events validate the immutable attempt before granting credits. Reconciliation of an existing payment remains possible after disabling Auto Top-Up or removing its card.

Status refresh never creates a charge. It queries a known payment ID, or searches provider payment pages for the immutable attempt marker if a creation response was lost. No match is inconclusive because Square list results are eventually consistent; the attempt remains pending. The lookup is bounded to ten pages of 100 payments. An unresolved/unknown payment beyond that window, a missing authorization record, or an unavailable provider requires explicit operational reconciliation. No new charge is invented to clear such a state.

Reference: https://developer.squareup.com/reference/square/payments/ListPayments

## Purchase history and inactive offers

New verified purchases store actual `paidAmountMinor` and `paidCurrency` beside the credit quantity. Legacy rows without verified monetary metadata display “Amount unavailable”; credit quantity is never converted to a fabricated price. Purchases paginate independently from usage. Read/index failures produce explicit retry errors on both history tabs.

Inactive packs and inactive prices reject new checkout. Fulfillment of already-created immutable checkout snapshots retains its original terms, including disabled or deleted offers. No live webhook replay or historical money backfill is part of this change.

## Required rollout order

Before publishing the API that uses purchase pagination, create ONLY this new Firestore composite index and wait for its state to be READY:

- Collection group: `credit_transactions`
- Query scope: `COLLECTION`
- Fields, in order: `userId ASCENDING`, `type ASCENDING`, `createdAt DESCENDING`

The existing credit-log query already relies on its `userId ASCENDING, createdAt DESCENDING` index; preserve and verify that existing index. Credit-run recovery uses equality-only queries and automatic index merging. No new rules, IAM permissions, credentials, or payment-provider configuration are needed. This change does not authorize deploying all index definitions or modifying rules. API and UI should ship together so pending financial fields are explained correctly.

Signup grants now enforce verified-email eligibility centrally for both provisioning entrypoints and continue using `config/billingDefaults.signupBonusCredits`. A zero grant retains the established one-time idempotency behavior, avoiding retroactive grants when the configured amount later changes. No new signup toggle was introduced.

## Offline verification

Regression suites cover serializable concurrent runs, transaction failure before commit, lost acknowledgements after commit, stale workers and successor fencing, repeated refund attempts, recovery racing admin refund, Free/paid cancellation, completion preference changes during execution, aggregate held balances, disabled top-up recovery, inactive checkout with old snapshot fulfillment, actual money and historical unknown values, purchase cursors, and explicit index/storage read failures. Provider calls, emails, and auth/payment boundaries are mocked. No live AI calls, payments, account deletions, emails, or webhook replays were performed.

## Manual exceptions and cash refunds

Use [Manual payment exceptions and refunds](manual-payment-reconciliation.md) for pending/unknown provider payments, missing fulfillment, session-credit returns, actual Square cash refunds, and chargebacks. It distinguishes existing safe recovery from cases requiring owner approval and maintainer review. Never infer a failed payment from a timeout or missing list result, clear an unknown authorization to charge again, or manually grant credits around the existing payment/order deduplication.
