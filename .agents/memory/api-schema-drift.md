---
name: API schema drift crashes frontend
description: Live Cloud Run API server may lag behind the frontend schema; any field missing from the API response will crash if accessed without a guard.
---

## The rule
Every field consumed from an API response must use optional chaining (`?.`) and a sensible fallback (`?? default`). Never assume the live API matches the TypeScript interface.

**Why:** Cloud Run deployments are manual and slow. The frontend (Firebase Hosting) deploys instantly. If a new field is added to `ModelCreditInfo` or any other API type, the live API may not have it for days. Accessing a missing field throws a runtime TypeError that, without a root error boundary, silently blanks the entire React app.

**How to apply:**
- In `estimateCredits` and all similar computation helpers: `creditInfo.tokensPerTurnByMode?.[mode] ?? fallback`
- For deeply nested fields: `creditInfo.fixedStagePrior?.input ?? 2000`
- Add a `RootErrorBoundary` at the React root (`main.tsx`) so any future crash shows an error card rather than a blank screen.
- When adding new fields to `ModelCreditInfo` (or any server-driven type), update both the API server response builder AND add frontend fallbacks in the same PR.
