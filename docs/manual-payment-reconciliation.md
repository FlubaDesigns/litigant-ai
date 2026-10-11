# Manual payment exceptions and refunds

This is the controlled-launch operator procedure, not a new refund policy or an automated payment system. It is not authorization to perform financial actions; each action still requires the appropriate owner decision and operator permissions. The application owner remains accountable for each exception and assigns one operator per case. Use existing authorized LAI Admin, Square Dashboard, and read-only production diagnostics. Do not copy credentials, full card details, or private session content into a support case.

The existing public Terms (`/terms`, section 3) say credits are non-refundable except where required by applicable law. This document does not change that language or decide whether an exception is legally required. Cash-refund eligibility, discretionary exceptions, dispute responses, and any associated credit deduction require the owner's explicit decision before action.

## 1. Open a case and establish what actually happened

Record a case ID, operator, owner, UTC timestamp, verified LAI user ID, the reported issue, and the next check or provider deadline. Keep money (minor units plus currency) separate from credit quantities. Never derive an old price from today's catalogue or from the credit balance.

Before issuing credits or a cash refund, collect and compare:

1. **Provider evidence:** the actual Square payment ID; current payment status; merchant/location; order ID when present; original amount/currency; date; and existing refund/dispute IDs and statuses. Open the payment in the correct production Square account. If a payment ID is known, prefer the provider's exact-payment lookup over a broad search. A screenshot, receipt, pending bank authorization, successful browser return, or absent search result alone is not proof of settled payment.
2. **Immutable authorization:** the matching server-owned `checkout_snapshots/{orderId}` snapshot or `auto_refill_attempts/{attemptId}` record. Match user, payment/order/attempt ID, exact amount/currency, location, and the original credit entitlement. For an Auto Top-Up, also match the exact request note/attempt marker; never create a replacement attempt or reuse another customer's authorization. For legacy payments without a snapshot, preserve the original receipt/order evidence and escalate any terms the existing validator cannot prove. Today's price is not historical evidence.
3. **Application evidence:** LAI Admin → Transactions, filtered to the exact user, including every page of relevant purchases, refunds, and adjustments. Inspect the existing `payment_events/payment_{paymentId}` marker, `checkout_fulfillments/{orderId}` when applicable, and matching `credit_transactions` records through authorized read-only diagnostics. A missing marker in a failed/unavailable read is not proof of absence. Do not edit or delete these records to force a replay.
4. **For session credit issues:** identify the exact usage transaction, session, and run. Check `credit_runs` and `settlementStatus` before treating a reservation as spent credits. Note automatic refunds and previous admin refunds. A `usage_shortfall` or `settlement_failure` diagnostic is not itself a collected charge.

If identity, amount, entitlement, or provider outcome is uncertain, stop changes, mark the case unresolved, and give it to the owner/maintainer. Preserve pending state and arrange the next check. Do not ask the customer to pay again to clear an unknown payment.

## 2. Choose the safe recovery path

### Existing Auto Top-Up is pending or unknown

- Have the signed-in customer use Billing's existing status refresh. `GET /billing/auto-refill` reconciles only the existing attempt; it does not create a charge. It can still reconcile after Auto Top-Up is disabled or its card is removed. Do not obtain or impersonate the customer's session/token.
- If a worker lease is still active, wait for that lease rather than clearing it. When no payment ID was stored, the existing recovery scans up to ten pages of 100 provider payments for the attempt marker. The provider's eventually consistent list returning no match remains inconclusive.
- A matching verified `COMPLETED` payment goes through existing validation and payment-ID deduplication before credit delivery. A verified `FAILED`/`CANCELED` attempt ends that authorization and disables future automatic charges. A lookup failure, nonterminal status, conflicting ID, missing authorization, or match beyond the bounded search stays unresolved.
- For an unresolved case, an authorized maintainer must compare the exact current provider payment and immutable records. There is no general-purpose admin button here to repair a missing authorization or reset an unknown charge. Do not clear `activeAttempt`, change a payment ID, replace its immutable request, re-enable top-up, submit a new card charge, or issue an unguarded manual grant as a shortcut. The owner decides the remedy once evidence is conclusive; missing evidence remains a launch-support blocker for that case.

### Completed checkout, but the customer reports missing credits

- Confirm the exact provider status and all matching evidence in section 1. If credits were already delivered, explain the recorded purchase and subsequent usage; do not grant twice.
- If delivery is absent, inspect the matching production Square webhook log and API error. Square Developer Console → the existing application → Webhooks → Logs shows the original payload and the application's response. Square retries failed deliveries for up to 24 hours; repair the underlying authorized service issue and observe the existing retry rather than creating a payment. See [Square webhook logs](https://developer.squareup.com/docs/devtools/webhook-logs) and [retry behavior](https://developer.squareup.com/docs/webhooks/overview).
- A `2xx` delivery response is not sufficient evidence of credited balance. Verify the purchase row, exact payment-ID marker, checkout fulfillment where applicable, and resulting account entitlement after recovery.
- Once retries are exhausted, or immutable terms cannot be validated, escalate to the owner and maintainer. This app has no operator replay/reconstruction UI. Any exceptional replay or data repair needs a separately reviewed, explicitly authorized plan that rechecks current provider status and preserves the same payment/order deduplication. Never fabricate a webhook, bypass its signature/validator, delete its marker, or substitute Admin “Adjust credits” for payment fulfillment: a later valid event could otherwise credit the same purchase again.

### A late completed payment belongs to a deleted account

- Preserve the exact provider payment, original checkout/attempt authorization, account-deletion evidence, and all payment/order deduplication evidence. Verify current provider status and any refunds/disputes before deciding what is owed.
- Do not recreate the deleted user/profile, mint replacement signup or purchase credits, create another account, change the payment owner, or start another charge. The existing-profile guard must leave this as an explicit reconciliation exception rather than silently recreating the account.
- Escalate to the application owner for a verified refund/reconciliation decision using the existing public terms and applicable obligations. Use the approved Square refund procedure below only if separately authorized. A failed fulfillment or deleted account does not itself authorize a refund or a compensating data write. Keep the case open until the provider and application records match the owner's approved resolution.

### Session usage needs a credit return

- Allow normal billing-history/status recovery to settle outstanding reservations. An active run has a 15-minute lease; the application will not refund a live run as an abandoned one. Never shorten the lease or invent an expired timestamp.
- After settlement and owner approval, use LAI Admin → Transactions → the exact negative **usage** transaction → Refund. This returns application credits, not money to a card. Enter a positive whole-credit amount no greater than the collected charge remaining after automatic and prior manual returns. Put the case ID and reason in the Reason field.
- The server rechecks ownership, settlement, remaining refundable credits, and the refund request ID atomically. If the first result is uncertain, inspect the ledger before retrying. Retrying in the same open dialog uses the same request ID; closing/reopening creates another request ID and is not proof that the first failed. Never increase the amount or select another charge to work around a rejection.
- Verify the refund ledger row and resulting balance and save their IDs in the case. A failed refund request does not authorize a manual adjustment instead.

## 3. Cash refunds, duplicate charges, and disputes

### Cash refund or verified duplicate payment

1. Recheck Square for existing pending/completed refunds and disputes on the exact payment ID. For a possible duplicate, identify both distinct provider payment IDs and which order/credits each fulfilled. Two notifications for one ID are not two charges.
2. Obtain the owner's decision for the specific payment, amount/currency, reason, and any credit/entitlement treatment. Record the decision. Do not invent a refund allowance, percentage, deadline, negative-balance policy, or automatic forfeiture rule.
3. An authorized human operator opens that payment in Square Dashboard → Transactions → Issue Refund, reviews the amount/reason and provider warnings, and submits the approved refund to the original payment. The LAI Admin credit-refund button cannot do this. Follow [Square's current refund procedure](https://squareup.com/help/us/en/article/6116-process-refunds); fees and funding consequences shown there remain applicable.
4. Record the refund ID/status. Keep the case open while pending and recheck the same refund, rather than submitting another. Do not promise a bank posting date or label a pending refund completed. Handle a declined/failed refund with the owner and Square Support before choosing any alternative payment method.
5. LAI currently handles payment events, not automatic refund/dispute credit clawbacks. A cash refund does not automatically reverse delivered credits. If the owner separately approves a credit adjustment, use existing Admin → Users → Adjust credits with the exact signed whole-credit amount and case/payment/refund IDs in the reason. This endpoint is **not idempotent**: submit once, inspect the ledger and balance after any timeout, and never blindly repeat. Do not use it to grant missing purchase credits. Do not deduct consumed credits, create debt, remove plan access, or suspend the account without an explicit owner decision for that case.

### Chargeback/dispute

- In Square Dashboard → Orders & payments → Disputes, verify the dispute ID, linked payment, amount, current status, and exact response deadline. Assign the owner a due date before that deadline. The owner decides whether to accept or challenge, and approves any evidence/communication. Follow [Square's dispute process](https://squareup.com/help/us/en/article/3882-payment-disputes-walkthrough).
- Preserve receipts, original terms/authorization, fulfillment/usage records, and relevant customer correspondence. Share only the evidence needed through Square's existing authorized dispute workflow; do not attach private conversation text by default.
- Do not issue a separate cash refund while a dispute may return the same funds without first resolving that risk with Square and the owner. Do not automatically ban the user or claw back credits. Record the final provider outcome, then apply only the separately approved ledger/entitlement decision, once.

## 4. Close the case, or leave a clear handoff

Close only when current provider evidence and the application ledger agree with the approved outcome, the customer-facing status is accurate, and no related attempt/refund/dispute remains pending. Record before/after balance, affected transaction IDs, exact monetary outcome, owner approval, operator, and timestamps. If unresolved, record the missing evidence, responsible person, next check, and provider deadline; an unresponsive provider is a handoff, not a successful reconciliation.

Before taking controlled paid traffic, the owner should assign coverage for these cases and retain access to the existing Admin/Square views. This document adds no scheduler, provider configuration, credentials, live replay, legal-policy change, or financial action. The notification UI separately marks weekly digest/product-update delivery unavailable; saving session-completion email preferences does not activate those services or rewrite their stored choices.
