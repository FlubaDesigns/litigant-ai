import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentInvitation } from "@/services/guestService";
export function useGuestInvitation() {
  const {user, userProfile} = useAuth();
  const [now, tick] = useState(Date.now);
  const query = useQuery({queryKey: ["guest-invitation", user?.uid, userProfile?.guestInvitationId],
    queryFn: getCurrentInvitation, enabled: !!userProfile?.guestInvitationId, retry: false});
  const invitation = query.data?.invitation;
  const deadline = invitation ? Date.parse(invitation.expiresAt) : null;
  useEffect(() => {
    if (!deadline) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => tick(Date.now()), Math.min(remaining + 50, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [deadline, query.dataUpdatedAt, now]);
  return {...query, invitation, isGuest: !!userProfile?.guestInvitationId,
    ended: !!invitation && (invitation.status === "expired" || invitation.status === "revoked" || Date.parse(invitation.expiresAt) <= Date.now())};
}
