import { auth } from "@/lib/firebase";
import { API_BASE } from "@/lib/apiUrl";
export interface GuestInvitation {
  id: string; label: string; credits: number; remainingCredits: number; plan: "free" | "pro";
  expiresAt: string; createdAt: string | null; status: "ready" | "claimed" | "expired" | "revoked" | "signed_up";
}
export async function guestFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {...init, headers: {
    "Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${token}`} : {}), ...init?.headers,
  }});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not load invitation.");
  return data;
}
export const getCurrentInvitation = () => guestFetch<{invitation: GuestInvitation | null}>("/guest/current");
