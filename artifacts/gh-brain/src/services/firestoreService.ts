import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface UserProfile {
  userId?: string;
  email: string;
  displayName: string;
  plan: "free" | "starter" | "pro" | "team";
  creditBalance: number;
  createdAt: string;
  lastLoginAt: string;
  subscriptionStatus: "none" | "active" | "cancelled" | "past_due";
  stripeCustomerId?: string;
  defaultSettings: {
    courtMode: string;
    confidenceTarget: number;
    responseMode: string;
    outputFormat: string;
    preferredTemplates?: string[];
  };
  notifications?: {
    sessionComplete: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
}

export async function createUserProfile(uid: string, data: Omit<UserProfile, "userId">): Promise<void> {
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, { ...data, userId: uid });
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), userId: snap.id } as UserProfile;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, data as Record<string, unknown>);
}

export function onUserProfileSnapshot(
  uid: string,
  callback: (profile: UserProfile | null) => void
): Unsubscribe {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback({ ...snap.data(), userId: snap.id } as UserProfile);
    }
  });
}
