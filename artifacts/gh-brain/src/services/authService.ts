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
import { createUserProfile } from "@/services/firestoreService";

const googleProvider = new GoogleAuthProvider();

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await firebaseSendEmailVerification(credential.user);
  await createUserProfile(credential.user.uid, {
    email,
    displayName,
    plan: "free",
    creditBalance: 50,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    subscriptionStatus: "none",
    defaultSettings: {
      courtMode: "adversarial",
      confidenceTarget: 85,
      responseMode: "balanced",
      outputFormat: "report",
    },
  });
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  const isNew = credential.user.metadata.creationTime === credential.user.metadata.lastSignInTime;
  if (isNew) {
    await createUserProfile(credential.user.uid, {
      email: credential.user.email || "",
      displayName: credential.user.displayName || "User",
      plan: "free",
      creditBalance: 50,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      subscriptionStatus: "none",
      defaultSettings: {
        courtMode: "adversarial",
        confidenceTarget: 85,
        responseMode: "balanced",
        outputFormat: "report",
      },
    });
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
