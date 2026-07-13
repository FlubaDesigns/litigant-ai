export const SEAT_AI_OPTIONS = [
  {
    id: "anthropic",
    name: "Claude",
    shortName: "Claude",
    grade: "A",
    desc: "Strong structured reasoning, writing, and implementation planning.",
  },
  {
    id: "openai",
    name: "GPT-4o",
    shortName: "GPT",
    grade: "A",
    desc: "Strong general reasoning, synthesis, and user-facing explanation.",
  },
  {
    id: "grok",
    name: "Grok",
    shortName: "Grok",
    grade: "A-",
    desc: "Strong adversarial reasoning and alternative viewpoints.",
  },
  {
    id: "gemini",
    name: "Gemini",
    shortName: "Gemini",
    grade: "B+",
    desc: "Strong broad context and multimodal reasoning.",
  },
] as const;

export type SeatAIId = (typeof SEAT_AI_OPTIONS)[number]["id"];

export interface SeatAssignment {
  provider: string;
  model?: string;
  /** 0–100 slider position for this seat. When set, overrides the global intelligenceLevel. */
  intelligenceLevel?: number;
  /** When true the seat inherits the session's global intelligenceLevel instead of its own. */
  useMasterSettings?: boolean;
}

export interface SeatMapConfig {
  orchestrator: SeatAssignment;
  moderator: SeatAssignment;
  auditor: SeatAssignment;
  architect: SeatAssignment;
  builder: SeatAssignment;
  litigants: SeatAssignment[];
}

export const SEAT_PURPOSES: Record<string, string> = {
  user: "Originates the request and controls the session.",
  orchestrator: "Talks directly to the user and returns final responses.",
  moderator: "Controls courtroom flow and builds the final briefing.",
  auditor: "Controls output and release decisions.",
  architect: "Defines build shape and reviews Builder output.",
  builder: "Builds the requested artifact or implementation.",
};

export const SEAT_DEFAULT_GRADES: Record<string, string> = {
  orchestrator: "A",
  moderator: "A-",
  auditor: "B+",
  architect: "A",
  builder: "B+",
};

export const GRADE_SCALE = [
  "F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+",
];

export function gradeToIndex(g: string): number {
  const i = GRADE_SCALE.indexOf(g);
  return i >= 0 ? i : 8;
}

export function indexToGrade(i: number): string {
  return GRADE_SCALE[Math.max(0, Math.min(GRADE_SCALE.length - 1, i))];
}

export interface SeatGrade {
  grade: string;
  runs: number;
  good: number;
  bad: number;
}

export type GradeMap = Record<string, SeatGrade>;

export function makeDefaultSeatAssignment(): SeatAssignment {
  return { provider: "anthropic", model: "claude-opus-4-5" };
}

export function makeDefaultSeatMap(litigantCount: number): SeatMapConfig {
  const def = makeDefaultSeatAssignment;
  return {
    orchestrator: def(),
    moderator: def(),
    auditor: def(),
    architect: def(),
    builder: def(),
    litigants: Array.from({ length: litigantCount }, def),
  };
}

export function makeDefaultGrades(): GradeMap {
  return {
    orchestrator: { grade: "A",  runs: 0, good: 0, bad: 0 },
    moderator:    { grade: "A-", runs: 0, good: 0, bad: 0 },
    auditor:      { grade: "B+", runs: 0, good: 0, bad: 0 },
    architect:    { grade: "A",  runs: 0, good: 0, bad: 0 },
    builder:      { grade: "B+", runs: 0, good: 0, bad: 0 },
  };
}

export function getGradeSummary(grade: SeatGrade | undefined): string {
  if (!grade || grade.runs === 0) return "No runs yet";
  return `${grade.runs} run${grade.runs !== 1 ? "s" : ""} — ${grade.good} 👍 ${grade.bad} 👎`;
}

export function getSeatAIShortName(provider: string): string {
  const opt = SEAT_AI_OPTIONS.find((o) => o.id === provider);
  return opt?.shortName ?? provider;
}

export function syncLitigantSeats(
  current: SeatAssignment[],
  count: number
): SeatAssignment[] {
  const result = [...current];
  while (result.length < count) result.push(makeDefaultSeatAssignment());
  return result.slice(0, count);
}
