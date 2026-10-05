import { useAuth } from "@/contexts/AuthContext";
import { canCreateArtifacts } from "@workspace/api-zod/session";
export function useArtifactAccess() {
  const {userProfile, isAdmin, firebaseReady} = useAuth();
  const preview = import.meta.env.DEV && (!firebaseReady || new URLSearchParams(window.location.search).get("e2e") === "1");
  return preview || canCreateArtifacts(userProfile?.plan, isAdmin);
}
