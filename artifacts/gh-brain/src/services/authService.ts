import {
  createUserWithEmailAndPassword,
  signInAnonymously, linkWithCredential, linkWithPopup, EmailAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  deleteUser,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();

import { guestFetch, getCurrentInvitation } from "./guestService";

import { API_BASE } from "@/lib/apiUrl";

type ProfileDetails = { role?: string; organization?: string };
let signInAttempt: Promise<User> | null = null;
let pendingProfile: { uid: string; extra: ProfileDetails } | null = null;

/** One account-setup path for sign-in, restored logins and explicit retries. */
async function provisionUser(user: User, extra?: ProfileDetails): Promise<void> {
  if (extra) pendingProfile = { uid: user.uid, extra };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const token = await user.getIdToken(true);
    const response = await fetch(`${API_BASE}/auth/provision`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pendingProfile?.uid === user.uid ? pendingProfile.extra : {}),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.provisioned !== true) {
      throw new Error(data?.error ?? "Account setup was not confirmed.");
    }
    if (pendingProfile?.uid === user.uid) pendingProfile = null;
  } catch {
    throw new Error("Your sign-in succeeded, but account setup could not finish. Retry setup to continue with this same account.");
  } finally { clearTimeout(timeout); }
}

async function performSignIn(operation: () => Promise<User>): Promise<User> {
  const attempt = operation();
  signInAttempt = attempt;
  try { return await attempt; }
  finally { if (signInAttempt === attempt) signInAttempt = null; }
}

export async function ensureAccountSetup(user: User): Promise<void> {
  // Firebase emits auth changes before the sign-in operation finishes. Wait for
  // that operation so registration details and provisioning are not duplicated.
  const attempt = signInAttempt;
  if (attempt) {
    const ready = await attempt;
    if (ready.uid !== user.uid) throw new Error("The signed-in account changed. Please retry.");
  } else {
    await provisionUser(user);
  }
}

export async function startGuestTrial(invitation: string): Promise<User> {
  return performSignIn(async () => {
    if (auth.currentUser && !auth.currentUser.isAnonymous) throw new Error("Sign out before using a guest invitation.");
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    await guestFetch("/guest/redeem", {method: "POST", body: JSON.stringify({invitation})});
    await user.getIdToken(true);
    await provisionUser(user);
    return user;
  });
}
async function guestForSignup(): Promise<User | null> {
  const user = auth.currentUser;
  if (!user?.isAnonymous) return null;
  const {invitation} = await getCurrentInvitation();
  if (invitation && ["ready", "claimed"].includes(invitation.status) && Date.parse(invitation.expiresAt) > Date.now()) return user;
  // A new signup after expiry uses a fresh identity; trial history is not reassigned.
  await firebaseSignOut(auth);
  return null;
}

/**
 * Send email verification via the server (Resend), falling back to
 * Firebase's built-in sender if the server endpoint is unavailable.
 */
async function sendVerificationViaServer(user: User): Promise<void> {
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE}/auth/send-verification`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[AuthService] server verification email failed, falling back to Firebase:", err);
    // Fallback: use Firebase's built-in sender
    const { sendEmailVerification } = await import("firebase/auth");
    await sendEmailVerification(user);
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  role?: string,
  organization?: string
): Promise<User> {
  return performSignIn(async () => {
    const guest = await guestForSignup();
    const credential = guest
      ? await linkWithCredential(guest, EmailAuthProvider.credential(email, password))
      : await createUserWithEmailAndPassword(auth, email, password);
    pendingProfile = { uid: credential.user.uid, extra: { role, organization } };
    await updateProfile(credential.user, { displayName });
    await provisionUser(credential.user, { role, organization });
    await sendVerificationViaServer(credential.user);
    return credential.user;
  });
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  return performSignIn(async () => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await provisionUser(credential.user);
    return credential.user;
  });
}

export async function signInWithGoogle(): Promise<User> {
  return performSignIn(async () => {
    const guest = await guestForSignup();
    const credential = guest ? await linkWithPopup(guest, googleProvider) : await signInWithPopup(auth, googleProvider);
    await provisionUser(credential.user);
    return credential.user;
  });
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
  pendingProfile = null;
}

/**
 * Send password reset email via the server (Resend).
 * Only catches genuine network failures — HTTP errors (including 429 rate-limit
 * responses) are surfaced directly to the caller. The Firebase fallback has been
 * removed: it silently bypassed the backend's dual rate limiters on any non-2xx
 * response, defeating the abuse protection entirely.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/send-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new Error("Password-reset service is temporarily unavailable. Please try again.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error("Too many reset requests. Please try again later.");
    throw new Error(data.error ?? "Unable to send password-reset instructions.");
  }
}

/**
 * Re-send email verification for the current user.
 */
export async function sendEmailVerification(): Promise<void> {
  if (auth.currentUser) {
    await sendVerificationViaServer(auth.currentUser);
  }
}

export async function deleteAccount(): Promise<void> {
  if (auth.currentUser) {
    await deleteUser(auth.currentUser);
  }
}
