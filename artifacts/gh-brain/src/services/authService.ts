import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  sendEmailVerification as firebaseSendEmailVerification,
  updateProfile,
  deleteUser,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api-server/api";

/**
 * Server-side equivalent of a Firebase Auth onCreate Cloud Function.
 * Called after signup/first login — the server creates the user doc and
 * grants the 50-credit bonus atomically (amount & logic are server-controlled).
 *
 * @param extra  Optional profile fields collected at signup (role, organization).
 *               Ignored for returning users (server checks doc existence).
 */
async function provisionUser(
  user: User,
  extra?: { role?: string; organization?: string }
): Promise<void> {
  try {
    const token = await user.getIdToken();
    await fetch(`${API_BASE}/auth/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(extra ?? {}),
    });
  } catch (err) {
    console.warn("[AuthService] provisionUser failed (non-fatal):", err);
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  role?: string,
  organization?: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await firebaseSendEmailVerification(credential.user);
  // Server creates user doc + grants 50 trial credits (idempotent, server-controlled)
  await provisionUser(credential.user, { role, organization });
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  const isNew =
    credential.user.metadata.creationTime === credential.user.metadata.lastSignInTime;
  if (isNew) {
    // Server creates user doc + grants 50 trial credits (idempotent, server-controlled)
    await provisionUser(credential.user);
  }
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await firebaseSendPasswordResetEmail(auth, email);
}

export async function sendEmailVerification(): Promise<void> {
  if (auth.currentUser) {
    await firebaseSendEmailVerification(auth.currentUser);
  }
}

export async function deleteAccount(): Promise<void> {
  if (auth.currentUser) {
    await deleteUser(auth.currentUser);
  }
}
