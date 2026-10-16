import { auth } from "@/lib/firebase";
import { getApiUrl } from "@/lib/apiUrl";

export type FeedbackRating = "good" | "bad" | "warn";

export interface FeedbackEntry {
  userId: string | null;
  sessionId: string | null;
  turnId: string;
  role: string;
  rating: FeedbackRating;
  reason?: string;
  notes?: string;
}

export async function submitFeedback(entry: FeedbackEntry): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in before submitting feedback.");
  const response = await fetch(getApiUrl("/feedback"), {method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`},
    body: JSON.stringify({...entry, userId: user.uid}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Feedback could not be saved. Please try again.");
  }
}
