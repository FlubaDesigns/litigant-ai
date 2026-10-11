import { CourtConfigSchema } from "@workspace/api-zod/session";
import type { CourtConfig } from "@workspace/api-zod/session";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
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
  /** UI hint only; the server-only deletion record is authoritative. */
  accountDeletion?: boolean;
  userId?: string;
  guestInvitationId?: string | null;
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
  squareCustomerId?: string;
  onboardingComplete?: boolean;
  defaultSettings: Partial<CourtConfig>;
  /** Legacy read fallback only. New writes use notifications.sessionComplete. */
  notifySessionComplete?: boolean;
  notifications?: {
    sessionComplete: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
  /**
   * Auto-refill preference — written by PATCH /billing/auto-refill
   * (setAutoRefillPreference in creditLedger.ts). Was missing from this type,
   * causing Billing.tsx to cast to `any` to read it.
   */
  autoRefill?: {
    enabled: boolean;
    thresholdCredits: number;
    consentVersion?: number;
    dollarAmount?: number;
    warningThresholdCredits?: number;
  };
  /** Admin-set test model override — forces all session seats to this model. */
  testProvider?: string;
  testModel?: string;
}

export async function saveUserConfig(
  uid: string,
  settings: UserProfile["defaultSettings"]
): Promise<void> {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { defaultSettings: JSON.parse(JSON.stringify(CourtConfigSchema.parse(settings))) });
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

/** Change only the delivered email preference; preserve unavailable options verbatim. */
export async function updateSessionCompleteNotification(uid: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { "notifications.sessionComplete": enabled });
}

export function onUserProfileSnapshot(
  uid: string,
  callback: (profile: UserProfile | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback({ ...snap.data(), userId: snap.id } as UserProfile);
    }
  }, onError);
}
