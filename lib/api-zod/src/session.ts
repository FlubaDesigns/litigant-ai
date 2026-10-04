import { z } from "zod";
export type ProviderName = string;
export const SeatAssignmentSchema = z.object({
  provider: z.string().min(1).max(100), model: z.string().max(200).optional(),
  intelligenceLevel: z.number().min(0).max(100).optional(), useMasterSettings: z.boolean().optional(),
});
export const CourtConfigSchema = z.object({
  litigantCount: z.number().int().min(1).max(10).default(4),
  confidenceTarget: z.number().int().min(50).max(100).default(90),
  maxIterations: z.number().int().min(1).max(20).default(5),
  responseMode: z.enum(["balanced", "thorough", "concise"]).default("balanced"),
  outputFormat: z.enum(["report", "memo", "bullets", "verdict"]).default("report"),
  provider: z.string().min(1).max(100).optional(),
  model: z.string().max(200).optional(), conscience: z.boolean().default(true),
  aiReasoning: z.enum(["independent", "chain"]).default("independent"),
  maxCredits: z.number().int().min(1).max(100000).default(500),
  debateMode: z.enum(["adversarial", "collaborative"]).default("adversarial"),
  artifactType: z.enum(["none", "auto", "report", "memo", "business-plan", "risk-matrix", "contract-review", "technical-spec", "pitch-deck", "legal-brief", "code", "landing-page", "blog-post"]).default("auto"),
  outputScope: z.enum(["consensus", "all-voices"]).default("consensus"),
  outputStrategy: z.enum(["moderator-consensus", "individual", "consensus+individual", "transcript", "artifact"]).default("moderator-consensus"),
  outputPreference: z.enum(["chat", "download", "both"]).default("both"),
  format: z.enum(["text", "markdown", "json", "docx", "pdf"]).default("text"),
  intelligenceLevel: z.number().min(0).max(100).optional(),
  outputPreferenceMode: z.enum(["answer-only", "document", "auto"]).optional(),
  seatMap: z.object({
    orchestrator: SeatAssignmentSchema, moderator: SeatAssignmentSchema,
    architect: SeatAssignmentSchema, builder: SeatAssignmentSchema, auditor: SeatAssignmentSchema,
    litigants: z.array(SeatAssignmentSchema).max(10),
  }).optional(),
});
export type CourtConfig = z.infer<typeof CourtConfigSchema>;
export type SeatAssignment = z.infer<typeof SeatAssignmentSchema>;
export type SeatMapConfig = NonNullable<CourtConfig["seatMap"]>;
export type ArtifactType = CourtConfig["artifactType"];
export type EngineConfig = Pick<CourtConfig, "litigantCount" | "confidenceTarget" | "maxIterations" | "responseMode" | "outputFormat"> & Partial<CourtConfig>;
export const CONFIDENCE_NOTE = "AI review score, not a measured probability of correctness. Verify important claims against original sources.";
export function confidenceLabel(score: number): string {
  return score > 0 ? `${score}/100 AI review` : "Not assessed";
}
export function sessionPath(id: string): string { return `/session/${encodeURIComponent(id)}`; }
export function parseReviewScore(text: string): number {
  const match = text.match(/^CONFIDENCE:\s*(\d{1,3})(?:\s*%|\s*\/100)?\s*$/im);
  const score = match ? Number(match[1]) : 0;
  return score >= 0 && score <= 100 ? score : 0;
}
export const REVIEW_SCORE_INSTRUCTION = "Include a separate CONFIDENCE: 0-100 line and a ## Assessment Basis section explaining evidence quality, unresolved contradictions, and missing facts. This is an uncalibrated AI review score, not a probability. Never raise the score because more turns ran or to match a requested target.";

export function resolveModelByIntelligence(
  intelligenceLevel: number,
  providerPreference: string,
  providers: { name: string; models: { id: string; label: string; qualityScore: number }[] }[]
): { provider: string; model: string; label: string } | null {
  const candidates =
    providerPreference === "auto"
      ? providers.flatMap((p) => p.models.map((m) => ({ ...m, providerName: p.name })))
      : (providers.find((p) => p.name === providerPreference)?.models ?? []).map((m) => ({
          ...m,
          providerName: providerPreference,
        }));

  if (candidates.length === 0) return null;

  const best = candidates.reduce((b, m) =>
    Math.abs((m.qualityScore ?? 50) - intelligenceLevel) <
    Math.abs((b.qualityScore ?? 50) - intelligenceLevel)
      ? m
      : b
  );

  return { provider: best.providerName, model: best.id, label: best.label };
}
