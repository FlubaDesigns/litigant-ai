/** One projection for owner reads, public reports and account exports.
 * Turns must already be ordered by the caller. Saved content wins independently
 * for each field: a missing notes field must never replace a saved transcript.
 */
interface SessionTurnContent {
  role?: string;
  round?: number;
  content?: string;
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
