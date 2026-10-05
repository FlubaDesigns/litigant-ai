import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { invitationActive } from "./guestInvitations.js";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

export function initFirebaseAdmin(): void {
  if (getApps().length > 0) return;

  const serviceAccount = process.env["FIREBASE_SERVICE_ACCOUNT"] ||
    process.env["FIREBASE_SERVICE_ACCOUNT_JSON_V2"] ||
    process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  const projectId = process.env["FIREBASE_PROJECT_ID"];

  if (process.env["FIREBASE_USE_ADC"] === "true" && projectId) {
    app = initializeApp({ projectId });
    console.log("[FirebaseAdmin] Initialized with runtime application default credentials");
  } else if (serviceAccount) {
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
  idToken: string,
  options: { allowUnclaimedGuest?: boolean; allowExpiredGuest?: boolean } = {}
): Promise<{ uid: string; email?: string; name?: string; admin?: boolean; emailVerified?: boolean; anonymous?: boolean; guest?: boolean } | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    // checkRevoked: true makes Firebase reject tokens whose refresh tokens have
    // been revoked (e.g. after a ban) and tokens belonging to disabled accounts,
    // rather than accepting them until natural expiry (~1 hour).
    const decoded = await getAuth().verifyIdToken(idToken, true);
    const anonymous = decoded.firebase.sign_in_provider === "anonymous";
    let guest = false;
    if (anonymous || decoded.guestTrial === true) {
      const db = getFirestore();
      const profile = (await db.collection("users").doc(decoded.uid).get()).data();
      if (profile?.guestInvitationId) {
        const invitation = (await db.collection("guest_invitations").doc(profile.guestInvitationId).get()).data();
        if (invitation?.claimedBy !== decoded.uid) return null;
        if (!options.allowExpiredGuest && !invitationActive(invitation)) return null;
        guest = true;
      } else if (anonymous && !options.allowUnclaimedGuest) return null;
    }
    return {
      uid: decoded.uid, anonymous, guest,
      email: decoded.email,
      name: decoded.name,
      admin: decoded["admin"] === true,
      // email_verified is true for Google/Apple OAuth users automatically.
      // Email+password users must complete the verification link before this is set.
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    return null;
  }
}

export function getFirestoreDb(): ReturnType<typeof getFirestore> | null {
  if (!isFirebaseConfigured()) return null;
  return getFirestore();
}
