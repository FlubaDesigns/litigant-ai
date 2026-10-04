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

## Credential incident mitigation

The October 4 follow-up found real service-account private keys and provider,
payment and admin credentials in tracked `.replit` configuration. These were
removed in `92f8919`. A second copy was found inside `downloads/litigant-ai.zip`;
that archive and four unreadable temporary ZIP exports have also been removed.
The tracked local Firebase environment file was replaced by a blank example.
Both export commands now use `scripts/source_safety.py` for the same source
manifest and credential checks, including nested ZIP contents. Deployment runs
the same check. These checks are targeted prevention, not proof that every
possible secret format is detected.

The owner-provided Google Console screenshots show that service-account keys
ending `cb646a62` and `2233be69` are disabled with reason `Exposed`. Their IDs
match the leaked private keys. The remaining active key was not found in the
exposed `.replit` configuration. This does not verify the status of the other
provider, payment or admin credentials; their revocation remains a separate
incident-response task. Historical Git objects still retain exposed values.

An old browser test contained an account refresh token. The current test uses isolated fixtures, with no real account credentials. Deployment checks the affected account's token validity date and revokes its refresh sessions if the exposed session could still be valid. A server-only migration marker makes this check idempotent. The affected account may need to sign in again. Historical Git commits still contain the old token; no history rewrite is claimed.

The rejected static Firebase service key is replaced with the existing keyless service identity, with database and Auth access checked during deployment.

A code review and automated tests cannot establish legal accuracy of AI output. There is still no empirical calibration study for the review score. Any launch claim about answer reliability needs a separate representative evaluation against source-grounded answers.
