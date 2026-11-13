/** One projection for owner reads, public reports and account exports.
 * Turns must already be ordered by the caller. Saved content wins independently
 * for each field: a missing notes field must never replace a saved transcript.
 */
import { decodeSessionContent, type StoredTurn } from "@workspace/api-zod/session-content";
export { encodeSessionContent, decodeSessionContent } from "@workspace/api-zod/session-content";

interface SessionTurnContent {
  role?: string;
  round?: number;
  content?: string;
}

/** Transitional reader: canonical records never consult legacy copies. */
export function presentSessionContent(data: FirebaseFirestore.DocumentData): FirebaseFirestore.DocumentData {
  if (data.sessionContent === undefined) return data;
  const { sessionContent, ...metadata } = data;
  const { turns: _turns, ...content } = decodeSessionContent(sessionContent);
  return { ...metadata, ...content };
}

export async function readSessionTurns(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData): Promise<StoredTurn[]> {
  if (data.sessionContent !== undefined) return decodeSessionContent(data.sessionContent).turns;
  const snapshot = await ref.collection("session_turns").get();
  return snapshot.docs.sort((a, b) => Number(a.data().turnIndex ?? Number.MAX_SAFE_INTEGER) - Number(b.data().turnIndex ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
    .map(doc => {
      const turn = doc.data();
      if (typeof turn.content !== "string") throw new TypeError("Invalid saved turn content");
      return { ...turn, id: doc.id, content: turn.content };
    });
}
export function projectSessionContent(
  saved: {transcript?: string; debateNotes?: string},
  turns: readonly SessionTurnContent[],
): {transcript: string; debateNotes: string} {
  return {
    transcript: saved.transcript || turns.filter(turn => turn.role !== "Orchestrator")
      .map(turn => `**${turn.role} (Round ${turn.round}):**\n${turn.content}`).join("\n\n---\n\n"),
    debateNotes: saved.debateNotes || turns.filter(turn => turn.role !== "Orchestrator" && turn.role !== "Verdict")
      .map(turn => `### ${turn.role} — Round ${turn.round}\n${turn.content}`).join("\n\n---\n\n"),
  };
}

/** Fixed pipeline stages use round 0 or 99; only debate rounds count. */
export function sessionTurnMetrics(turns: readonly SessionTurnContent[]) {
  const debate = turns.filter(turn => (turn.round ?? 0) > 0 && (turn.round ?? 0) < 99);
  return {
    roundsCompleted: debate.reduce((maximum, turn) => Math.max(maximum, turn.round ?? 0), 0),
    litigantCount: new Set(debate.map(turn => turn.role)).size,
  };
}
