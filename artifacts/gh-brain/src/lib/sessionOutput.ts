import { restoreCourtConfig, RESPONSE_VIEWS, type CourtConfig } from "@workspace/api-zod/session";

export function isLitigantRole(role: string): boolean {
  return role !== "You" && !/^(Orchestrator|Moderator|Architect|Builder|Auditor|Verdict)(?:\b|$)/.test(role);
}

type OutputState = {
  config?: Partial<CourtConfig>; finalAnswer?: string; debateNotes?: string; transcript?: string;
  artifacts?: string; caveats?: string;
  runtimeFeed?: {role: string; content: string; round: number}[];
};

/** The same selected output drives the screen, copy, print and every download. */
export function sessionOutput(state: OutputState) {
  const strategy = restoreCourtConfig(state.config ?? {}).outputStrategy;
  const consensus = state.finalAnswer || "No final answer generated.";
  const voices = state.debateNotes || (state.runtimeFeed ?? []).filter(f => isLitigantRole(f.role) && f.content)
    .map(f => `### ${f.role} — Round ${f.round}\n${f.content}`).join("\n\n") || "No individual responses recorded.";
  const transcript = state.transcript || (state.runtimeFeed ?? []).filter(f => f.content)
    .map(f => `### ${f.role}\n${f.content}`).join("\n\n") || "No transcript recorded.";
  const content = strategy === "individual" ? voices
    : strategy === "consensus+individual" ? `## Court consensus\n\n${consensus}\n\n## Individual responses\n\n${voices}`
    : strategy === "transcript" ? transcript
    : strategy === "artifact" ? state.artifacts || "No document generated."
    : consensus;
  const title = RESPONSE_VIEWS[strategy];
  const sections = [{title, content}];
  if (state.artifacts && strategy !== "artifact") sections.push({title:"Document", content:state.artifacts});
  if (state.caveats) sections.push({title:"Sources & Caveats", content:state.caveats});
  return {title, content, sections};
}
