import {
  createUserWithEmailAndPassword,
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

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api-server/api";

/**
 * Server-side equivalent of a Firebase Auth onCreate Cloud Function.
 * Called after signup/first login — the server creates the user doc and
 * grants the 100-credit bonus atomically (amount & logic are server-controlled).
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
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await sendVerificationViaServer(credential.user);
  await provisionUser(credential.user, { role, organization });
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await provisionUser(credential.user);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  await provisionUser(credential.user);
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
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
