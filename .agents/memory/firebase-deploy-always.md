---
name: Firebase deploy — always do it
description: After ANY frontend change to gh-brain, always build and deploy to Firebase Hosting without waiting to be asked.
---

## Rule

After every change to the gh-brain frontend, ALWAYS run build + deploy as the final step — no exceptions, no asking the user.

## Commands

```bash
# Write service account (use V2 — V1 no longer authenticates with firebase CLI)
printenv FIREBASE_SERVICE_ACCOUNT_JSON_V2 > /tmp/sa_v2.json

# Build (run from artifact dir)
cd artifacts/gh-brain && PORT=5173 BASE_PATH=/ npx vite build --config vite.config.ts

# Deploy (firebase CLI is at workspace root, NOT inside artifact)
GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa_v2.json /home/runner/workspace/node_modules/.bin/firebase deploy \
  --only hosting \
  --project litigant-ai \
  --non-interactive
```

## Notes
- Firebase CLI is at `/home/runner/workspace/node_modules/.bin/firebase` — NOT `artifacts/gh-brain/node_modules/.bin/firebase`
- Use `FIREBASE_SERVICE_ACCOUNT_JSON_V2` (NOT V1 and NOT `FIREBASE_SERVICE_ACCOUNT`) — V1 returns auth failure from firebase CLI even with valid JSON
- Use `printenv` (NOT `echo`) to write the SA JSON to file — `echo` can mangle newlines in the key
- Firebase Hosting public dir: `artifacts/gh-brain/dist/public`
- Live URL: https://litigant-ai.web.app
- Deploy takes ~30 seconds total

**Why:** User has been repeatedly frustrated by changes not appearing on the live site. Build + deploy must be automatic after every frontend edit. V2 SA key is the only one that currently works with firebase CLI auth.
