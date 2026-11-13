import { MAX_LITIGANTS } from "@workspace/api-zod/limits";
import { type EngineConfig as CourtConfig } from "@workspace/api-zod/session";
import type { ResponseMode, RoleDefinition, TurnRecord } from "./brainTypes.js";

export function getRoles(config: CourtConfig): RoleDefinition[] {
  if (!Number.isInteger(config.litigantCount) || config.litigantCount < 1 || config.litigantCount > MAX_LITIGANTS) {
    throw new Error(`Litigant count must be between 1 and ${MAX_LITIGANTS}`);
  }
  const roles: RoleDefinition[] = [
    {
      name: "Advocate",
      persona: "Advocate",
      instruction: "Build the strongest possible case FOR the proposition. Present evidence, logic, and examples. Be persuasive.",
    },
    {
      name: "Skeptic",
      persona: "Skeptic",
      instruction: "Challenge and attack the proposition with the strongest counterarguments. Find weaknesses in the Advocate's reasoning. Be rigorous.",
    },
    {
      name: "Devil's Advocate",
      persona: "Devil's Advocate",
      instruction: "Take the most contrarian and uncomfortable position. Challenge both sides. Expose hidden assumptions.",
    },
    {
      name: "Empiricist",
      persona: "Empiricist",
      instruction: "Evaluate claims strictly on empirical evidence and data. Reject unsupported assertions from all sides.",
    },
    {
      name: "Ethicist",
      persona: "Ethicist",
      instruction: "Evaluate the moral and ethical dimensions of the proposition. Apply frameworks of justice, fairness, rights, and duties. Expose value conflicts the other seats overlook.",
    },
    {
      name: "Precedent Analyst",
      persona: "Precedent Analyst",
      instruction: "Ground every argument in historical cases, analogies, and established patterns. Ask: what happened the last time someone tried this? What does history say about outcomes like this?",
    },
    {
      name: "Pragmatist",
      persona: "Pragmatist",
      instruction: "Focus exclusively on practical outcomes and real-world implementation. Ignore theoretical elegance. Ask: does this actually work in practice? Who executes it, how, and at what cost?",
    },
    {
      name: "Risk Assessor",
      persona: "Risk Assessor",
      instruction: "Identify, name, and quantify the risks, failure modes, and unintended consequences of the proposition. Stress-test every assumption. What is the worst plausible outcome?",
    },
    {
      name: "Synthesizer",
      persona: "Synthesizer",
      instruction: "Build bridges between the opposing positions. Identify where the other seats actually agree beneath their disagreements. Propose integrative solutions that capture the strongest elements from all sides.",
    },
    {
      name: "Consequentialist",
      persona: "Consequentialist",
      instruction: "Trace the long-term second and third-order effects. Where does this proposition lead in five years? Ten? Who benefits downstream and who is harmed? Ignore immediate optics; follow the consequences.",
    },
  ];
  return roles.slice(0, Math.min(config.litigantCount, roles.length));
}

export function getDebateModeClause(debateMode?: "adversarial" | "collaborative"): string {
  if (debateMode === "collaborative") {
    return "\n\nInteraction style: Collaborative. Build on the arguments of other seats rather than attacking them. Look for where prior reasoning can be strengthened, extended, or synthesised into a more complete picture. Seek common ground and work toward collective understanding rather than individual victory.";
  }
  return "\n\nInteraction style: Adversarial. Actively challenge and counter the arguments of other seats. Identify contradictions, expose weak reasoning, and attack unsupported assumptions in what others have said. Winning the argument — not consensus — is the goal.";
}

export function getMaxOutputTokens(responseMode: ResponseMode): number {
  return { balanced: 600, thorough: 1200, concise: 300 }[responseMode];
}

export function priorDebateTurns(lines: string[], roles: RoleDefinition[]): TurnRecord[] {
  const names = new Set(roles.map(role => role.name));
  const envelopes = new Set([...names, "Orchestrator", "Moderator", "Architect", "Builder", "Auditor", "Verdict", "User"]);
  const recovered: TurnRecord[] = [];
  let current: TurnRecord | undefined;
  for (const line of lines) {
    const match = line.match(/^\*\*([^\n]+?) \(Round (\d+)\):\*\*(?:[ \t]*\r?\n|[ \t]+)([\s\S]*)$/);
    if (match) {
      // A prior seat may now be disabled by a lower administrator role limit.
      // Its envelope still ends the preceding seat's history; its reasoning
      // must never be concatenated into an active independent seat's argument.
      const round = Number(match[2]);
      current = names.has(match[1]) && Number.isSafeInteger(round) && round > 0
        ? { role: match[1], round, content: match[3] } : undefined;
      if (current) recovered.push(current);
    } else {
      const envelopeRole = line.match(/^\*\*([^\n]+?):\*\*/)?.[1]?.replace(/\s+\([^()\n]*\)$/, "");
      if (envelopeRole && envelopes.has(envelopeRole)) {
        // Known seats, summaries, and user evidence must not become own history.
        // Ordinary bold headings such as **Caveat:** remain inside the argument.
        current = undefined;
      } else if (current) {
        current.content += `\n\n---\n\n${line}`;
      }
    }
  }
  return recovered;
}
