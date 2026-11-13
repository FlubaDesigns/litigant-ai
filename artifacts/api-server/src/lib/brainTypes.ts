import { type ModelProvenance } from "./modelProvenance.js";
import type { CallUsage } from "./sessionPricing.js";
import { type EngineConfig as CourtConfig } from "@workspace/api-zod/session";
import type { Response } from "express";
import type { ProviderName } from "./providers/index.js";
import { type RunInstructions } from "./runInstructions.js";

export type ResponseMode = "balanced" | "thorough" | "concise";

export type OutputFormat = "report" | "memo" | "bullets" | "verdict";

export interface RoleDefinition {
  name: string;
  persona: string;
  instruction: string;
}

export interface TurnRecord {
  role: string;
  round: number;
  content: string;
}

export interface TokenUsage {
  calls?: CallUsage[];
  inputTokens: number;
  outputTokens: number;
}

export type PauseReason = "credit_cap" | "iteration_limit" | "output_incomplete";

export interface RebuttalContext {
  challenge: string;
  originalVerdict: string;
  rebuttalRound: number;
  parentSessionId?: string;
}

export interface CourtroomOutcome {
  /** Why the session terminated or routed the way it did. */
  reason:
    | "approved"           // Auditor approved — delivered to user
    | "not_enough"         // Auditor: missing determinative fact; relay to user
    | "convergence_failure"// 3 artifact cycles without APPROVED
    | "credit_cap"         // credit cap hit before full pipeline
    | "output_incomplete"  // provider stopped before a stage completed
    | "iteration_limit"    // max debate rounds without target confidence
    | "aborted";           // user stopped
  confidenceAtExit: number;
  /** Debate round count at exit (0 when debate was skipped). */
  round: number;
}

export interface RelayContext {
  /**
   * The missing information the user is now supplying in response to a
   * NOT_ENOUGH Auditor decision.
   */
  missingInfo: string;
  relayRound: number;
  /**
   * Persisted discussion from the owned parent session. Every seat receives
   * this evidence together with the new answer.
   */
  originalTranscript: string[];
  parentSessionId?: string;
}

export interface CaseFileItem {
  id: string;
  type: "url" | "file";
  name: string;
  content: string;
  url?: string;
}

export interface BrainRunOptions {
  /** Server-owned snapshot; never accepted from the request body. */
  instructions?: RunInstructions;
  /** Reserved pricing snapshot supplied by the route for this run. */
  priceCalls: (calls: CallUsage[]) => number;
  onCallUsage?: (call: CallUsage) => void;
  enabledProviders?: string[];
  fallbackModels?: Record<string, string>;
  estimatedCredits: number;

  question: string;
  config: CourtConfig;
  templateId?: string;
  templateSystemPrompt?: string;
  sessionId?: string;
  /** When continuing a paused session, pass the accumulated transcript lines. */
  continueFromTranscript?: string[];
  /** Owned saved draft, retained if a continuation stops before rebuilding it. */
  continueFromArtifact?: string;
  /** When the user challenges a verdict — triggers a rebuttal run. */
  rebuttalContext?: RebuttalContext;
  /** Pre-briefing documents or URLs attached before the session run. */
  caseFile?: CaseFileItem[];
  /**
   * Skip the orchestrator and debate loop entirely — run only the fixed
   * pipeline (Moderator → Architect → Builder → Auditor → Verdict).
   * Used when resuming a session that was paused before the pipeline
   * because the credit cap was hit during debate.
   * Must be combined with `continueFromTranscript` (the debate transcript).
   */
  resumeWithFixedPipeline?: boolean;
  /**
   * Provider name sent by the client after a previous session's provider failed over.
   * When set, overrides `config.provider` so the whole session uses this provider
   * instead of the one originally selected by the user.
   */
  forcedProvider?: string;
  /**
   * Relay context — user is supplying missing information in response to a
   * question from the court. Every seat receives the previous discussion
   * and new answer before the court continues through its configured pipeline.
   */
  relayContext?: RelayContext;
  res: Response;
  abortSignal?: AbortSignal;
}

export interface BrainRunResult {
  sessionId: string;
  confidence: number;
  creditsUsed: number;
  finalAnswer: string;
  debateNotes: string;
  transcript: string[];
  caveats: string;
  artifacts: string;
  turns: TurnRecord[];
  provider: ProviderName;
  model: string;
  modelProvenance: ModelProvenance;
  tokenUsage: TokenUsage;
  /** Which conscience canon version governed this session (e.g. "v2.0-canon"). */
  conscienceVersion: string;
  /** Present when the session stopped before hitting the confidence target. */
  pauseReason?: PauseReason;
  /**
   * Token usage for the fixed pipeline stages (Moderator, Architect, Builder,
   * Auditor, Verdict) — everything after the debate loop ends, including any
   * Auditor retry passes (Builder revision + re-review). Saved to Firestore so
   * getCalibratedFixedStageTokens() can learn real averages across the last 50
   * sessions instead of relying on hardcoded priors.
   * Zero when a credit_cap pause stops after Moderator (Architect/Builder/Auditor/Verdict never ran).
   */
  fixedStageTokens: { input: number; output: number };
  /**
   * True when 3 full Architect→Builder→Architect→Auditor cycles exhausted
   * without APPROVED. The last-cycle artifact is still delivered; the user
   * will be asked for clarification.
   */
  convergenceFailure?: boolean;
  /** A provider stopped before a complete stage could be reviewed or delivered. */
  outputIncomplete?: { role: string; reason: string };
  /** User cancellation preserves paid partial work without claiming approval. */
  cancelled?: boolean;
  /**
   * Which pipeline branch the session took after the debate.
   * "artifact"    → Architect→Builder→Auditor (standard path)
   * "no-artifact" → Moderator synthesis reviewed directly by Auditor
   */
  artifactPath: "artifact" | "no-artifact";
  /** Structured metadata about why/how the session terminated. */
  courtroomOutcome: CourtroomOutcome;
  /** Number of relay rounds completed (user supplied missing info). */
  relayCount: number;
  /**
   * End-of-job satisfaction tap — set to null initially; updated by the
   * frontend after the user taps. Only exposed when relayCount >= 1.
   */
  endOfJobTap?: "worth_it" | "not_worth_it" | null;
  /**
   * When review requires user input (NOT_ENOUGH or convergence failure), this contains the
   * specific missing information the user must supply before the court
   * can complete its answer.
   */
  relayQuestion?: string;
}
