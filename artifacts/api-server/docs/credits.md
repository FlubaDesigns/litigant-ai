# Credit system reference

The maintained credit lifecycle and recovery documentation is
[Billing recovery](../../../docs/billing-recovery.md). Checkout snapshots are
covered in [Payment reconciliation](../../../docs/manual-payment-reconciliation.md).

The implementation has these owners:

| Behavior | Authoritative implementation |
| --- | --- |
| Dollar/credit conversion | `lib/api-zod/src/billing.ts`; USD value is derived from credits per dollar |
| Model prices and selection | `src/lib/providerCatalog.ts` |
| Session quotes and usage pricing | `src/lib/sessionPricing.ts` and `src/lib/creditEngine.ts` |
| Session reservation, settlement and recovery | `src/lib/creditRunSettlement.ts` |
| Purchases, grants and manual adjustments | `src/lib/creditLedger.ts` |
| Active pack catalog | `src/lib/creditPacksConfig.ts` |
| Auto Top-Up authorization and reconciliation | `src/lib/autoRefill.ts` |

Session accounting requires a durable run ID. The old standalone reservation
and reconciliation functions have been removed. Guests use authenticated,
owner-issued invitations; there is no anonymous free-session execution route.
Historical versions of this document remain available through Git history.
