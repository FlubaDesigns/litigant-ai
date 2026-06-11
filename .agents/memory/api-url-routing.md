---
name: API URL from frontend in Replit path routing
description: How the gh-brain frontend calls the api-server in Replit's path-based proxy
---

In this project, Replit serves both artifacts on the same domain via path-based routing:
- Frontend (`gh-brain`): `https://{domain}/gh-brain/`
- API server (`api-server`): `https://{domain}/api-server/`

**The rule:** From the frontend, call the API at `/api-server/api/{endpoint}`. Since both share the same domain in Replit's proxy, this absolute path works from the browser.

```typescript
// sessionService.ts
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";
```

**Why:** The API server mounts its routes at `/api` (in `app.ts`: `app.use("/api", router)`). Combined with Replit's proxy prefix `/api-server`, the full path becomes `/api-server/api/{route}`.

**How to apply:** Any frontend service that calls the Express backend uses this base URL. `VITE_API_URL` can override it for custom deployments or local dev with a different proxy.
