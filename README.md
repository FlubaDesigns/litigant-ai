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
  mockup-sandbox/    # Design canvas / component previews
lib/
  api-spec/          # OpenAPI spec
  api-client-react/  # Generated API client
  api-zod/           # Generated Zod schemas
  db/                # Drizzle schema (Postgres, optional)
firebase-functions/  # Cloud Run Dockerfile + entry point
scripts/             # Deploy + utility scripts
firestore.rules      # Firestore security rules
firebase.json        # Firebase Hosting + rewrite config
```

---

## Local development

```bash
# Install dependencies
pnpm install

# Start everything (frontend + API)
pnpm --filter @workspace/gh-brain run dev        # http://localhost:<PORT>
pnpm --filter @workspace/api-server run dev      # http://localhost:8080
```

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
| `ADMIN_MASTER_SECRET` | api-server | Bootstrap admin claim |

---

## Deploy

**Frontend → Firebase Hosting**
```bash
cd artifacts/gh-brain && pnpm build
firebase deploy --only hosting
```

**API → Cloud Run** (triggered automatically by GitHub Actions on push to `main`)
```bash
node scripts/deploy-cloudrun.mjs
```

GitHub Actions workflow: `.github/workflows/deploy-cloudrun.yml`

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

Set the first admin via:
```bash
curl -X POST https://<API>/api/admin/set-claim \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","secret":"<ADMIN_MASTER_SECRET>"}'
```
User must sign out and back in for the claim to take effect.
