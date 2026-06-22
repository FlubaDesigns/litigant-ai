# Firebase & Cloud Functions Audit

Generated: 2026-06-22

---

## Firestore Collections

| Collection | What's stored |
|---|---|
| `users/{uid}` | Profile, credit balance, plan, settings, ban status |
| `sessions/{sessionId}` | Brain session metadata, final answer, artifacts, debate notes |
| `sessions/{sessionId}/session_turns/{turnId}` | Per-turn AI transcript subcollection |
| `credit_transactions/{txId}` | Immutable ledger — every credit add, usage, refund |
| `payment_events/{key}` | Idempotency tracking for Square webhooks + signup bonuses |
| `feedback/{id}` | User ratings, thumbs, abuse reports |
| `config/apiKeys` | LLM provider API keys (admin only) |
| `config/pricing` | Live model multiplier overrides (admin only) |
| `config/featureFlags` | System toggles — guestMode, proUpgrade, etc. |
| `system_config/conscience` | Canon v2 AI truth mandate text |
| `guest_sessions/{ip_hash}` | One-time free trial tracking by IP |
| `api_logs/{logId}` | Backend execution logs and error tracking |

---

## Client-Side Firestore Calls (`gh-brain/src/services/`)

| File | Call | What it does |
|---|---|---|
| `firestoreService.ts` | `getDoc` | Fetch `users/{uid}` on login |
| | `setDoc` | Create user profile on first sign-up |
| | `updateDoc` | Save settings, onboarding, default config |
| | `onSnapshot` | **Live listener** on `users/{uid}` — drives real-time credit balance everywhere |
| `feedbackService.ts` | `addDoc` | Write to `feedback/` on thumbs/report |
| `Billing.tsx` | `updateDoc` + `deleteField()` | Clear consumed Square auto-refill redirect URL |

---

## Server-Side Admin SDK Calls (`api-server/src/`)

| File | Call | What it does |
|---|---|---|
| `lib/firebaseAdmin.ts` | `verifyIdToken` | Validates every authenticated API request |
| `lib/creditLedger.ts` | `runTransaction` (3-step) | Idempotency check → update balance → write ledger entry |
| `routes/brain.ts` | `runTransaction` | Reserve credits before AI run (atomic deduct) |
| | `runTransaction` | Reconcile credits after run (refund or charge overage) |
| | `setDoc` | Write completed session to `sessions/{id}` |
| | batch writes | Write all turn records to `session_turns/` subcollection |
| | `get/set` on `guest_sessions` | IP-based free trial gate |
| `routes/admin.ts` | `setCustomUserClaims` | Grant `admin: true` claim |
| | `updateUser({ disabled: true })` | Ban user in Firebase Auth |
| | `collection.count().get()` | System stats aggregation |
| | CRUD | `config/apiKeys`, `config/pricing`, `config/featureFlags`, `system_config/conscience` |
| `routes/account.ts` | Recursive delete | Wipes `users/{uid}`, all their sessions, all session_turns |
| `routes/sessions.ts` | `getDoc` / `getDocs` | Fetch session list and individual sessions |
| | `updateDoc` | Rename, star, archive, share a session |
| | delete + subcollection sweep | Delete session + all its turns |

---

## Firebase Auth Calls

### Client (`authService.ts`)
- `createUserWithEmailAndPassword`
- `signInWithEmailAndPassword`
- `signInWithPopup` (Google)
- `signOut`
- `sendPasswordResetEmail`
- `sendEmailVerification`
- `deleteUser` — only called *after* Firestore data is wiped by `DELETE /account`

### Server (`admin.ts` / `auth.ts`)
- `verifyIdToken` — every authenticated route
- `getUserByEmail` — admin user search
- `getUser(uid)` — admin user detail

---

## Cloud Functions / Hosting Config

### `functions.ts` — exported function

```
api  →  v2 onRequest
        timeout: 540s
        memory:  512 MiB
        region:  us-central1
```

### `firebase.json` — hosting rewrite

```
/api-server/**  →  Cloud Run service "api"
```

### `firestore.rules` — access model

| Path | Rule |
|---|---|
| `users/{uid}` | Owner read only; `creditBalance`, `plan`, `banned` are write-blocked client-side (server only) |
| `sessions/{id}` | Owner read/write; public read if `shared == true` |
| `feedback/{id}` | Create-only — no read, update, or delete |
| `config/**` | Default deny — server only |
| `credit_transactions/**` | Default deny — server only |
| `api_logs/**` | Default deny — server only |
| Everything else | Default deny |

---

## Summary

- **12 Firestore collections** across client and server
- **1 live snapshot listener** (`users/{uid}`) drives real-time credit balance in the UI
- **All financial mutations** (reserve, reconcile, add credits) happen server-side in atomic `runTransaction` calls — the client can never directly write `creditBalance`, `plan`, or `banned`
- **1 Cloud Run function** (`api`) serves the entire Express API behind Firebase Hosting rewrites
- **Rebuttal sessions** are saved with `isRebuttal: true`, `rebuttalRound`, `rebuttalChallenge`, and `parentSessionId` fields on the session document
