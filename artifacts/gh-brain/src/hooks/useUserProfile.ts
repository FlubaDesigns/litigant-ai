import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/services/firestoreService";

export function useUserProfile(): {
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  credits: number;
  plan: UserProfile["plan"];
} {
  const { userProfile, loading, isAdmin } = useAuth();

  return {
    profile: userProfile,
    loading,
    isAdmin,
    credits: userProfile?.creditBalance ?? 0,
    plan: userProfile?.plan ?? "free",
  };
}
