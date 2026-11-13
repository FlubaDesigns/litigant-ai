/** Canonical projections for owner reads, public reports and account exports. */
import { decodeSessionContent, type StoredTurn } from "@workspace/api-zod/session-content";
export { encodeSessionContent, decodeSessionContent } from "@workspace/api-zod/session-content";

interface SessionTurnContent {
  role?: string;
  round?: number;
  content?: string;
}

/** All saved content has one representation. Metadata-only failed runs have no content. */
function contentFor(data: FirebaseFirestore.DocumentData) {
  if (data.sessionContent !== undefined) return decodeSessionContent(data.sessionContent);
  if (["transcript", "transcriptLines", "debateNotes"].some(key => Object.hasOwn(data, key))) {
    throw new Error("Saved session content has not been migrated");
  }
  return {transcript: "", transcriptLines: [] as string[], debateNotes: "", turns: [] as StoredTurn[]};
}

export function presentSessionContent(data: FirebaseFirestore.DocumentData): FirebaseFirestore.DocumentData {
  const {sessionContent: _stored, transcript: _oldTranscript, transcriptLines: _oldLines, debateNotes: _oldNotes, ...metadata} = data;
  const {turns: _turns, ...content} = contentFor(data);
  return {...metadata, ...content};
}

export function readSessionTurns(data: FirebaseFirestore.DocumentData): StoredTurn[] {
  return contentFor(data).turns;
}

/** Fixed pipeline stages use round 0 or 99; only debate rounds count. */
export function sessionTurnMetrics(turns: readonly SessionTurnContent[]) {
  const debate = turns.filter(turn => (turn.round ?? 0) > 0 && (turn.round ?? 0) < 99);
  return {
    roundsCompleted: debate.reduce((maximum, turn) => Math.max(maximum, turn.round ?? 0), 0),
    litigantCount: new Set(debate.map(turn => turn.role)).size,
  };
}
