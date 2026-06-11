import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

export function initFirebaseAdmin(): void {
  if (getApps().length > 0) return;

  const serviceAccount = process.env["FIREBASE_SERVICE_ACCOUNT"];
  const projectId = process.env["FIREBASE_PROJECT_ID"];

  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      app = initializeApp({ credential: cert(parsed) });
      console.log("[FirebaseAdmin] Initialized with service account");
    } catch (e) {
      console.warn("[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
    }
  } else if (projectId) {
    app = initializeApp({ projectId });
    console.log("[FirebaseAdmin] Initialized with project ID (application default credentials)");
  } else {
    console.warn(
      "[FirebaseAdmin] Not configured — set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID. " +
        "Auth validation and Firestore writes will be skipped (guest mode)."
    );
  }
}

export function isFirebaseConfigured(): boolean {
  return getApps().length > 0;
}

export async function verifyIdToken(
  idToken: string
): Promise<{ uid: string; email?: string; admin?: boolean } | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      admin: decoded["admin"] === true,
    };
  } catch {
    return null;
  }
}

export function getFirestoreDb(): ReturnType<typeof getFirestore> | null {
  if (!isFirebaseConfigured()) return null;
  return getFirestore();
}
