import { SatisfactionRatingsSchema, type SatisfactionRatings } from "@workspace/api-zod/satisfaction";
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

export async function submitFeedback(entry: FeedbackEntry | (SatisfactionRatings & {kind:"satisfaction";version:1;sessionId:string})): Promise<void> {
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

export async function loadSatisfaction(sessionId:string):Promise<import("@workspace/api-zod/satisfaction").SatisfactionRatings|null> {
  const user=auth?.currentUser;
  if (!user) throw new Error("Sign in before rating your experience.");
  const response=await fetch(getApiUrl(`/feedback/satisfaction/${encodeURIComponent(sessionId)}`),{
    headers:{Authorization:`Bearer ${await user.getIdToken()}`},
  });
  if (!response.ok) throw new Error("Your saved ratings could not be loaded. Please retry.");
  const body=await response.json();
  return body.ratings===null ? null : SatisfactionRatingsSchema.parse(body.ratings);
}
export async function submitSatisfaction(sessionId:string,ratings:SatisfactionRatings):Promise<void> {
  await submitFeedback({kind:"satisfaction",version:1,sessionId,...SatisfactionRatingsSchema.parse(ratings)});
}
