# Administrator setup

Admin setup uses the existing Google-authorized CLI. The invoking identity must
already have permission to update Firebase Auth users in the selected project.
With Application Default Credentials available:

```bash
FIREBASE_PROJECT_ID=litigant-ai pnpm --filter @workspace/scripts \
  exec tsx src/set-admin-claim.ts you@example.com
```

No separate admin password is needed. Existing administrator claims and normal
sign-in are unchanged. Sign out and back in after granting a new claim.

The retired `/admin/set-claim` route must not be restored.
