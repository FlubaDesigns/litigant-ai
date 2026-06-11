---
name: ProtectedRoute guest mode when Firebase unconfigured
description: ProtectedRoute bypasses auth when Firebase env vars aren't set
---

When Firebase is not configured (VITE_FIREBASE_* env vars absent), `isConfigured` in `firebase.ts` is false, which means `firebaseReady` in AuthContext is also false. Without this bypass, `ProtectedRoute` sees `loading=false, user=null` and redirects everyone to sign-in — making the app unusable for development and demo.

**The rule:** At the top of `ProtectedRoute`, return `<>{children}</>` when `firebaseReady` is false.

```tsx
// ProtectedRoute.tsx
const { user, loading, isAdmin, firebaseReady } = useAuth();
if (!firebaseReady) return <>{children}</>;  // guest mode
```

**Why:** This lets the full app be tested and demonstrated without Firebase credentials. When Firebase is wired up, the normal auth flow takes over automatically.

**How to apply:** Don't remove this guard. If any page should be strictly locked even in unconfigured mode, add an explicit check inside that page rather than in ProtectedRoute.
