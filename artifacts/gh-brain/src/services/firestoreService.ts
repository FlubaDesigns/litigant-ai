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

export type UserRole =
  | "individual"
  | "lawyer"
  | "law-student"
  | "researcher"
  | "business"
  | "journalist"
  | "other";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  "individual":  "Just curious / personal use",
  "lawyer":      "Practicing lawyer",
  "law-student": "Law student",
  "researcher":  "Academic / researcher",
  "business":    "Business professional",
  "journalist":  "Journalist / writer",
  "other":       "Other",
};

export interface UserProfile {
  userId?: string;
  email: string;
  displayName: string;
  /** Self-reported role — collected at signup, editable in Settings */
  role?: UserRole;
  /** Firm, university, or organisation name (optional) */
  organization?: string;
  plan: "free" | "starter" | "pro" | "team";
  creditBalance: number;
  createdAt: string;
  lastLoginAt: string;
  subscriptionStatus: "none" | "active" | "cancelled" | "past_due";
  stripeCustomerId?: string;
  onboardingComplete?: boolean;
  defaultSettings: {
    // V29 Mission Briefing fields
    conscience?: boolean;
    outputScope?: string;
    debateMode?: string;
    aiReasoning?: string;
    seatAssignment?: string;
    outputStrategy?: string;
    outputPreference?: string;
    format?: string;
    confidenceTarget?: number;
    maxIterations?: number;
    maxCredits?: number;
    litigantCount?: number;
    // Legacy
    courtMode?: string;
    responseMode?: string;
    outputFormat?: string;
    provider?: string;
    model?: string;
  };
  notifications?: {
    sessionComplete: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
}

export async function saveUserConfig(
  uid: string,
  settings: UserProfile["defaultSettings"]
): Promise<void> {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { defaultSettings: settings });
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
