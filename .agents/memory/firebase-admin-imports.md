---
name: Firebase Admin imports
description: Correct way to import firebase-admin in Node.js/ESM — modular imports only
---

The rule: always use modular imports from `firebase-admin/*` subpackages. The default import `import admin from "firebase-admin"` fails at runtime with `Cannot read properties of undefined (reading 'apps')`.

```typescript
// CORRECT
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// WRONG — causes runtime crash
import admin from "firebase-admin";
admin.apps.length // TypeError: Cannot read properties of undefined
```

**Why:** firebase-admin v12+ moved to a modular API. The default export no longer carries `.apps`, `.auth()`, etc. as methods.

**How to apply:** Any time you write a file that uses firebase-admin, use the subpackage imports above. `FieldValue` comes from `firebase-admin/firestore`, not from the main package.
