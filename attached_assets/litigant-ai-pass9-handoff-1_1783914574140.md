# Litigant AI — Infrastructure & Scripts Audit — Pass 9 Handoff
**Scope:** The remaining unaudited territory: shared `lib/` packages (`db`, `api-client-react`, `api-zod`, `api-spec`), `firebase-functions/`, and `scripts/` (deployment, admin bootstrap, seeding).
**Method:** Same standard throughout — every claim verified against actual source, exact file/line citations.

---

## Finding 20 — Deployment Script Writes Plaintext Secrets to a Predictable Temp Path

**Priority: Medium-High.** Not remotely exploitable (requires local access to whatever machine runs this script), but a real gap for extremely high-value credentials.

**File:** `scripts/deploy-cloudrun.mjs`.

**What happens:** every time you deploy, this script builds a full Cloud Run service YAML containing every production secret in plaintext — the entire Firebase service account JSON key, `ADMIN_MASTER_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` — and writes it to `${tmpdir()}/cloudrun-service-${Date.now()}.yaml`. I confirmed `tmpdir()` resolves to the standard `/tmp` on this kind of environment. Three compounding issues:

1. **Predictable filename.** `Date.now()` is a guessable timestamp — another local process or user watching `/tmp` during the deploy window could identify the file.
2. **No explicit restrictive permissions.** `writeFileSync` is called with no explicit `mode` option (just `writeFileSync(yamlPath, yaml, "utf8")`), so the script relies on the operating system's default file permissions rather than requesting an owner-only mode like `0o600`. What that default actually resolves to depends on the deployment environment's configured umask, which I don't have direct evidence of — but the code itself makes no attempt to request restrictive permissions either way, which is the fixable gap regardless of what any particular environment's default happens to be.
3. **Cleanup only happens in the `finally` block.** If the process is killed hard (SIGKILL, OOM, container restart, Replit shell disconnect) between the file being written and the `gcloud run services replace` command completing, `unlinkSync` never runs, and the file — containing a full GCP service account key, arguably your single most powerful credential — is left sitting in `/tmp` indefinitely.

**Why the service account key specifically matters:** it's not just an API key for one service — a Firebase/GCP service account JSON grants broad programmatic access to your entire Firebase project (Firestore read/write, Auth admin, etc.), scoped by whatever IAM role it was issued. It's about as high-value a secret as this system has, and it's the one being written to disk here.

**Recommended fix, in order of impact:**
1. Create a private temporary directory with `mkdtemp` instead of writing directly into the shared `/tmp`.
2. Write the file with an explicit restrictive mode: `{ mode: 0o600 }` — owner-only read/write.
3. Use a randomized filename rather than a predictable `Date.now()` timestamp.
4. Continue deleting it in the cleanup path, as the script already does.
5. If the `gcloud` tooling supports it, eliminate the temp file entirely by streaming the manifest directly instead of writing it to disk at all — I haven't verified this against the current `gcloud` CLI, so treat it as worth investigating rather than a confirmed option.

---

## Confirmed Clean / Confirmed Dead Code

- **`lib/db`** — this entire package is unused template scaffolding, not a hidden second data store. `schema/index.ts` contains only template comments with `export {}` (no actual tables defined), and `index.ts` would throw immediately if `DATABASE_URL` isn't set. Confirmed via full-codebase grep that `@workspace/db` is never imported anywhere in the live app — the whole system genuinely is Firestore-only, as every prior pass assumed. No security concern, just dead weight worth deleting for hygiene if you ever do repo cleanup.
- **`scripts/src/stripeClient.ts`, `scripts/src/seed-products.ts`** — both deliberately neutralized with clear redirect comments pointing to the real Square-based implementation, not confusing leftover dead code. Good practice, not an issue.
- **`scripts/src/set-admin-claim.ts`** — CLI-only, requires actual `FIREBASE_SERVICE_ACCOUNT` credentials to run, consistent with and no weaker than the equivalent HTTP endpoint (`POST /admin/set-claim`, reviewed Pass 1).
- **`scripts/seed-conscience.mjs`** — reads the service account directly from the environment variable, never writes it to disk. Clean, and its seeded text matches `conscienceConfig.ts`'s fallback exactly (consistent).
- **`scripts/build-release.py`** — doesn't handle any secrets at all (just packages source into a zip), so no equivalent risk to Finding 20 here.
- **`firebase-functions/`** — just `Dockerfile`, `Procfile`, and `package.json`/lockfile; no application logic to audit.
- **`lib/api-client-react`, `lib/api-zod`, `lib/api-spec`** — auto-generated API client/schema/spec code (Orval-generated from an OpenAPI spec). Not hand-written application logic; lower priority for a security/money audit since bugs here would typically just be generation-config issues, not business-logic bugs. Flagging as reviewed-but-deprioritized rather than skipped.

---

## Status Update

With this pass, essentially the entire repository has now been covered: full backend (Passes 1, 2, 3, 8), full admin panel (Passes 6, 7), the core public frontend (Passes 4, 5), and now infrastructure/scripts (this pass). Still technically open from Pass 5's lower-priority queue: legal pages, a few shared components (`AppLayout.tsx`, `CourtDiagram.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`), and the remainder of `Landing.tsx` beyond the pricing/CTA sections already checked. Let me know if you want those closed out too, or if you'd rather have the full consolidated summary across all 9 passes now.
