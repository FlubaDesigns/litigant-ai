import { z } from "zod";
export type ProviderName = string;
export const SeatAssignmentSchema = z.object({
  provider: z.string().min(1).max(100), model: z.string().max(200).optional(),
  intelligenceLevel: z.number().min(0).max(100).optional(), useMasterSettings: z.boolean().optional(),
});
export const CourtConfigFieldsSchema = z.object({
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
  outputStrategy: z.enum(["moderator-consensus", "individual", "consensus+individual", "transcript", "artifact"]).default("moderator-consensus"),
  format: z.enum(["text", "markdown", "json", "docx", "pdf"]).default("text"),
  intelligenceLevel: z.number().min(0).max(100).optional(),
  outputPreferenceMode: z.enum(["answer-only", "document", "auto"]).optional(),
  seatMap: z.object({
    orchestrator: SeatAssignmentSchema, moderator: SeatAssignmentSchema,
    architect: SeatAssignmentSchema, builder: SeatAssignmentSchema, auditor: SeatAssignmentSchema,
    litigants: z.array(SeatAssignmentSchema).max(10),
  }).optional(),
});
// Normalize saved configurations once at the boundary; execution and UI use only these fields.
export const CourtConfigSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const { outputScope, outputPreference: _unused, ...value } = input as Record<string, unknown>;
  if (outputScope === "all-voices" && (!value.outputStrategy || value.outputStrategy === "moderator-consensus")) {
    value.outputStrategy = "consensus+individual";
  }
  if (value.intelligenceLevel === undefined && !value.provider && !value.model) value.intelligenceLevel = 50;
  const mode = value.outputPreferenceMode ?? (value.artifactType === "none" ? "answer-only"
    : value.artifactType && value.artifactType !== "auto" ? "document" : "auto");
  value.outputPreferenceMode = mode;
  if (mode === "answer-only") value.artifactType = "none";
  else if (value.artifactType === "none") value.artifactType = "auto";
  return value;
}, CourtConfigFieldsSchema);
export type CourtConfig = z.infer<typeof CourtConfigSchema>;
/** Repair the formerly offered 25-round preference when reading saved data. New requests remain strict. */
export function restoreCourtConfig(input: Partial<CourtConfig> = {}): CourtConfig {
  return CourtConfigSchema.parse({...input, maxIterations: input.maxIterations === 25 ? 20 : input.maxIterations});
}
export const RESPONSE_VIEWS: Record<CourtConfig["outputStrategy"], string> = {
  "moderator-consensus": "Court consensus", individual: "Individual responses",
  "consensus+individual": "Consensus + individual", transcript: "Full transcript", artifact: "Document",
};
export const DOCUMENT_TYPES: Record<Exclude<CourtConfig["artifactType"], "none">, string> = {
  auto: "Court chooses type", report: "Report", memo: "Decision memo", "business-plan": "Business plan",
  "risk-matrix": "Risk matrix", "contract-review": "Contract review", "technical-spec": "Technical spec",
  "pitch-deck": "Pitch deck", "legal-brief": "Legal brief", code: "Code", "landing-page": "Landing page", "blog-post": "Blog post",
};
export const DOWNLOAD_FORMATS: Record<CourtConfig["format"], string> = {
  text: "Text", markdown: "Markdown", json: "JSON", docx: "Word (.docx)", pdf: "PDF",
};
export const ANSWER_STYLES: Record<CourtConfig["outputFormat"], string> = {
  report: "Structured report", memo: "Executive memo", bullets: "Bullet points", verdict: "Direct verdict",
};
export const OUTPUT_MODES = {auto: "Auto — document when needed", "answer-only": "Answer only", document: "Always build a document"};
export function outputSummary(config: CourtConfig): string {
  return `${RESPONSE_VIEWS[config.outputStrategy]} · ${OUTPUT_MODES[config.outputPreferenceMode ?? "auto"]}${config.artifactType !== "none" ? ` · ${DOCUMENT_TYPES[config.artifactType]}` : ""} · ${ANSWER_STYLES[config.outputFormat]} · ${config.responseMode} · ${DOWNLOAD_FORMATS[config.format]}`;
}
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

export const PAID_ACCESS_BADGE = "Paid credits required";
export const PAID_ACCESS_CTA = "Unlock all features";
export const PAID_ACCESS_NOTE = "Any paid credit purchase unlocks all features. Free promotional credits provide dialogue only. Sessions still use credits.";

/** Shared full-feature entitlement. The stored "pro" value is legacy account access, not the Pro credit package. */
export function canCreateArtifacts(plan: unknown, isAdmin = false): boolean {
  return isAdmin || plan === "pro";
}

/** Displayed account features follow the same entitlement used by the server. */
export function accountAccess(plan: unknown, isAdmin = false) {
  return canCreateArtifacts(plan, isAdmin)
    ? {label:"Member", features:["AI dialogue", "Templates and document creation", "Document downloads", "Public report sharing", "Saved conversation history"]}
    : {label:"Free", features:["AI dialogue", "Promotional credits (free)", "Purchased credits unlock all features"]};
}

export function applyArtifactAccess<T extends Partial<CourtConfig>>(config: T, allowed: boolean): T {
  return allowed ? config : {...config, outputPreferenceMode: "answer-only", artifactType: "none", outputStrategy: config.outputStrategy === "artifact" ? "moderator-consensus" : config.outputStrategy};
}
