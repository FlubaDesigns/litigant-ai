import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isConfigured } from "@/lib/firebase";

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
  if (!isConfigured) {
    console.log("[AI Brain] Feedback (Firebase not configured):", entry);
    return;
  }

  try {
    await addDoc(collection(db, "feedback"), {
      ...entry,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[AI Brain] Failed to submit feedback:", err);
    throw err;
  }
}
