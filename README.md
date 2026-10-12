# Litigant AI

**Put it to the question.**

Multi-model adversarial reasoning SaaS. A panel of AI models (GPT, Claude, Gemini, Grok) argue, cross-examine, and deliver a confidence-scored verdict on any question, decision, contract, or business plan.

- **Production:** https://litigant-ai.com
- **Firebase hosting:** https://litigant-ai.web.app
- **API (Cloud Run):** https://api-781960492360.us-central1.run.app

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript (Tailwind / shadcn/ui) |
| Backend | Express + TypeScript → Cloud Run |
| Auth | Firebase Auth (email/password + Google OAuth) |
| Database | Firestore |
| Payments | Square (credit packs) |
| Email | Resend |
| Hosting | Firebase Hosting (frontend) + Cloud Run (API) |

---

## Monorepo layout

```
artifacts/
  gh-brain/          # React frontend (Vite)
  api-server/        # Express API server
lib/
  api-spec/          # OpenAPI spec
  api-client-react/  # Generated API client
  api-zod/           # Generated Zod schemas
  db/                # Drizzle schema (Postgres, optional)
scripts/             # Deploy + utility scripts
firestore.rules      # Firestore security rules
firebase.json        # Firebase Hosting + rewrite config
```

---

## Production runtime

The only application backend is the production Express app in
`artifacts/api-server/src/app-firebase.ts`, with routes registered in
`src/routes/index-firebase.ts`. Cloud Run starts it through
`src/server-cloudrun.ts`; Firebase Hosting forwards `/api-server/**` requests
there. The Cloud Functions adapter also imports this same app.

There is no separate development API server or API `dev` command. The backend
build produces only `dist/server-cloudrun.mjs`, and `pnpm --filter
@workspace/api-server start` runs that production entry point.

Automated backend tests import the production app directly. Browser tests use
an isolated local frontend fixture; they do not provision another cloud server.

### Required environment variables

Copy `.env.example` to `.env.local` in each artifact that needs it and fill in:

| Variable | Where | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | gh-brain | Firebase web config |
| `VITE_FIREBASE_PROJECT_ID` | gh-brain | GCP project ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON_V2` | api-server | Firebase Admin SA key (JSON, minified) |
| `SQUARE_ACCESS_TOKEN` | api-server | Square production token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | api-server | Square webhook HMAC key |
| `RESEND_API_KEY` | api-server | Resend email API key |
| `ANTHROPIC_API_KEY` | api-server | Anthropic |
| `OPENAI_API_KEY` | api-server | OpenAI |
| `GEMINI_API_KEY` | api-server | Google Gemini |
| `XAI_API_KEY` | api-server | xAI / Grok |

---

## Release and deploy

Pushes to `main` run source, test, typecheck, browser, and build checks only.
They do not deploy or change production accounts or data. The required source
release gate is the `check-release` job in
[`.github/workflows/deploy-cloudrun.yml`](.github/workflows/deploy-cloudrun.yml).

Production API and Firebase Hosting releases go through the isolated Litigant AI
workflow in Authorization Engine. That workflow pins the exact reviewed Main
commit SHA and requires its successful source release gate before deployment.

The legacy `scripts/deploy-cloudrun.mjs` script is not the approved release path
and must not be run for this release. Do not bypass the isolated workflow with
direct Cloud Run or Firebase deployment commands.

---

## .gitignore — what to exclude

The following should **never** be committed:

```gitignore
# Dependencies — always rebuildable via pnpm install
node_modules/
.pnpm-store/

# Build output — rebuildable
artifacts/*/dist/
artifacts/*/build/
firebase-functions/lib/

# Downloads folder — local exports only, not source
downloads/

# Secrets and local config
.env
.env.local
.env.*.local
*.pem
*.key
*.p12

# OS / editor noise
.DS_Store
*.log
.vscode/settings.json
```

---

## Tests

```bash
# Unit tests (Vitest)
cd artifacts/gh-brain && pnpm test

# End-to-end PDF export (Playwright)
cd artifacts/gh-brain && npx playwright test e2e/pdf-export.spec.ts
```

---

## Credits system

Every AI session costs credits. Users start with **500 free credits** on signup.

- 1 credit ≈ $0.01 USD
- Packs: Starter (500 cr / $4.99), Pro (2,200 cr / $19.99), Mega (4,200 cr / $34.99)
- Payments via Square checkout links; webhook at `POST /api/square/webhook`

---

## Admin

Admin setup uses the existing Google-authorized CLI. The invoking identity must
already have permission to update Firebase Auth users in the selected project.
With Application Default Credentials available:

```bash
FIREBASE_PROJECT_ID=litigant-ai pnpm --filter @workspace/scripts \
  exec tsx src/set-admin-claim.ts you@example.com
```

No separate admin password is needed. Existing administrator claims and normal
sign-in are unchanged. Sign out and back in after granting a new claim.
