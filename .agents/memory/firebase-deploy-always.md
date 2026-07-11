---
name: Firebase deploy — always do it
description: After ANY frontend change to gh-brain, always build and deploy to Firebase Hosting without waiting to be asked.
---

## Rule

After every change to the gh-brain frontend, ALWAYS run build + deploy as the final step — no exceptions, no asking the user.

## Commands

```bash
# Build
cd artifacts/gh-brain && PORT=5173 BASE_PATH=/ npx vite build --config vite.config.ts

# Deploy
GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json node_modules/.bin/firebase deploy \
  --only hosting \
  --project $VITE_FIREBASE_PROJECT_ID \
  --non-interactive
```

## Notes
- Service account is in `$FIREBASE_SERVICE_ACCOUNT` env var — write to `/tmp/sa.json` before deploying
- Firebase Hosting public dir: `artifacts/gh-brain/dist/public`
- Live URL: https://litigant-ai.web.app
- Deploy takes ~30 seconds total

**Why:** User has been repeatedly frustrated by changes not appearing on the live site. Build + deploy must be automatic after every frontend edit.
