# Litigant AI codebase review and repair

The product has a useful core: a configurable debate workflow, separate review and artifact stages, streaming results, saved history, and a transactional credit ledger. Its main weaknesses were inconsistent contracts and success paths that hid failures. The existing tests covered many happy paths but their Firestore and AI mocks missed real service constraints.

## Canonical sources

| Concern | Source |
| --- | --- |
| Session schema, inferred types, defaults, review labels, model selection | `lib/api-zod/src/session.ts` |
| Complete template catalogue and persisted-override normalization | `lib/api-zod/src/templates.ts`; backend `templateStore.ts` |
| Accepted model selections, quote and immutable price snapshot | backend `sessionPricing.ts` |
| Credit balance mutations and immutable ledger entries | backend `creditLedger.ts` |
| Saved session identity, transcript, settings and cumulative spend | server-owned Firestore session document; `/session/:sessionId` |
| Frontend API base URL | frontend `lib/apiUrl.ts` |

## Repairs

- Provider failures and malformed auditor/architect decisions stop the run. Neither produces an approved result by default.
- Removed the turn-count confidence formula and automatic score increase. Review scores come from the auditor, remain explicitly uncalibrated, and display as “Not assessed” when missing.
- Full seat assignments, intelligence controls, output preference and template instructions survive request validation. Explicit answer-only/document selection controls the actual pipeline.
- Each successful provider call records its actual provider, model and token use. Quote, cap checks and settlement use the same per-run price snapshot, including admin multiplier overrides. The client no longer has a separate session estimate formula or arbitrary surcharge.
- Budget checks apply before calls throughout the pipeline; billed charges cannot exceed the session cap. Estimates remain estimates, not guarantees of completion or correctness.
- Chained speakers can see earlier arguments from the same round.
- Credit grants read all transaction documents before writing, as required by Firestore. Custom top-ups validate credits against the actual paid amount.
- Resumes load the server's transcript and accepted settings, append turn records and preserve saved titles, dates, share links, stars and cumulative charges. Completion waits for save/settlement. Failed saves refund the remaining collected charge.
- Session links work from History and email; old `/app/session/:id` links redirect. Sign-in preserves the intended destination.
- Templates share one complete catalogue; admin changes reach both selection and execution.
- PDF extraction uses the installed parser's v2 API and releases resources. URL extraction pins the connection to the vetted public IP to prevent DNS rebinding.
- Session documents are writable only by the backend. Clearing an auto-refill redirect removes both required fields.
- Mobile court controls have 44px add/remove targets, readable labels, correct seat/model summaries, and no nested configure button.
- Pages and PDF/Word generators load on demand. The Docker build includes shared packages, preserves pnpm runtime links and packages seat briefs/PDF dependencies. Third-party SDKs retain their complete dependency trees, avoiding missing transitive imports at startup.
- Deployment gates include workspace type checking, backend/frontend tests, browser tests and the production frontend build. Deployed backend commit provenance is blocking. The malformed Firestore indexes JSON is repaired and deployment configuration parsing is checked in CI.

## Verification

Regression coverage includes Firestore read/write ordering, payment deduplication and custom amounts, failure refunds, failed saves, ownership, resumed metadata/transcripts/turns, mixed-model pricing, shared configuration, low review scores, provider failures, malformed release decisions, pipeline budget limits, real PDF extraction and pinned URL connections. AI calls and payments in automated tests use fixtures; they do not spend live credits or charge cards.

Local browser execution is restricted by the workspace's socket sandbox. All 10 browser tests passed in GitHub Actions. A container startup health check also gates deployment. A green deploy workflow is required evidence for the shipped revision.

## Outstanding operational action

An old browser test contained an account refresh token. The current test now uses isolated fixtures, with no real account credentials. Revoke the exposed account's existing refresh sessions in Firebase and review access history. Removing the token from the current tree does not remove it from historical commits. No history rewrite or account credential rotation is claimed by this change.

A code review and automated tests cannot establish legal accuracy of AI output. There is still no empirical calibration study for the review score. Any launch claim about answer reliability needs a separate representative evaluation against source-grounded answers.
