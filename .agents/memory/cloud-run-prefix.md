---
name: Cloud Run path prefix
description: Firebase Hosting rewrites to Cloud Run pass the full path including the source prefix.
---

When Firebase Hosting has a rewrite rule like:
```json
{ "source": "/api-server/**", "run": { "serviceId": "api", "region": "us-central1" } }
```
It proxies the **full original URL path** to Cloud Run — e.g. a request to `/api-server/api/healthz` arrives at Cloud Run as `/api-server/api/healthz`, not `/api/healthz`.

**The fix:** `server-cloudrun.ts` creates a **wrapper Express app** that strips the prefix BEFORE forwarding to the inner app:
```typescript
const wrapperApp = express();
wrapperApp.use((req, _res, next) => {
  req.url = req.url.replace(/^\/api-server/, "") || "/";
  next();
});
wrapperApp.use(innerApp);
```

**Critical:** The middleware must be on the wrapper app, not added to `innerApp` after import. Adding `app.use(...)` to the inner app after its routes are registered does NOT run the middleware before the routes — Express processes middleware in registration order.

**Why:** Firebase Hosting proxies verbatim paths; the inner app's routes are mounted at `/api`, so `/api-server/api/...` would 404 without the prefix strip.

**How to apply:** Always use the wrapper pattern in `server-cloudrun.ts`. Never add the prefix-strip middleware directly to `app-firebase.ts` (that would affect local dev too).
