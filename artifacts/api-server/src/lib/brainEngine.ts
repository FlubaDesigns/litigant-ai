import type { Response } from "express";
import { createProviderAsync, getConfiguredProvidersAsync } from "./providers/index.js";
import type { AIProvider, ChatMessage, ProviderName } from "./providers/index.js";
import {
  estimateSessionCredits,
  calculateActualCredits,
  charsToTokens,
} from "./creditEngine.js";
import { getConscienceClause } from "./conscienceConfig.js";
import { getAllSeatBriefs } from "./seatBriefs.js";

export type ResponseMode = "balanced" | "thorough" | "concise";
export type OutputFormat = "report" | "memo" | "bullets" | "verdict";

export interface CourtConfig {
  litigantCount: number;
  confidenceTarget: number;
  maxIterations: number;
  responseMode: ResponseMode;
  outputFormat: OutputFormat;
  provider?: ProviderName;
  model?: string;
  // V29 Mission Briefing fields
  conscience?: boolean;
  aiReasoning?: "independent" | "chain";
  maxCredits?: number;
  debateMode?: "adversarial" | "collaborative";
  artifactType?: string;
}

interface RoleDefinition {
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
  inputTokens: number;
  outputTokens: number;
}

function getRoles(config: CourtConfig): RoleDefinition[] {
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

/**
 * Returns an interaction-style clause injected into every litigant's system
 * prompt. debateMode sets *how* those seats engage with each other's arguments.
 */
function getDebateModeClause(debateMode?: "adversarial" | "collaborative"): string {
  if (debateMode === "collaborative") {
    return "\n\nInteraction style: Collaborative. Build on the arguments of other seats rather than attacking them. Look for where prior reasoning can be strengthened, extended, or synthesised into a more complete picture. Seek common ground and work toward collective understanding rather than individual victory.";
  }
  return "\n\nInteraction style: Adversarial. Actively challenge and counter the arguments of other seats. Identify contradictions, expose weak reasoning, and attack unsupported assumptions in what others have said. Winning the argument — not consensus — is the goal.";
}

function getMaxOutputTokens(responseMode: ResponseMode): number {
  return { balanced: 600, thorough: 1200, concise: 300 }[responseMode];
}

function sendSSE(res: Response, event: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    // Flush immediately so SSE events reach the client without waiting for a buffer to fill.
    // Express compression middleware adds res.flush(); fall back to the raw socket drain.
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }
}

/** Estimate credits before running — used for pre-reservation */
export function estimateCreditCost(config: CourtConfig): number {
  return estimateSessionCredits({
    litigantCount: config.litigantCount,
    maxIterations: config.maxIterations,
    responseMode: config.responseMode,
    model: config.model,
  });
}

export type PauseReason = "credit_cap" | "iteration_limit";

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
   * Full debate transcript from the original session, so Moderator can
   * incorporate the new info without re-running the debate.
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
  question: string;
  config: CourtConfig;
  templateId?: string;
  templateSystemPrompt?: string;
  sessionId?: string;
  /** When continuing a paused session, pass the accumulated transcript lines. */
  continueFromTranscript?: string[];
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
   * NOT_ENOUGH Auditor decision. Moderator receives the original transcript
   * plus the new info and decides whether to trigger a fresh debate round
   * (SUBSTANTIVE: yes) or pass directly to Auditor (SUBSTANTIVE: no).
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
   * When Auditor (no-artifact) returned NOT_ENOUGH, this contains the
   * specific missing information the user must supply before the court
   * can complete its answer.
   */
  relayQuestion?: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Session aborted by client");
}

async function resolveProvider(config: CourtConfig, forcedProvider?: string): Promise<AIProvider> {
  const configured = await getConfiguredProvidersAsync();

  const requested = forcedProvider ?? (config.provider as string | undefined);
  if (requested && configured.includes(requested)) {
    return createProviderAsync(requested, config.model);
  }

  for (const fallback of ["openai", "gemini", "grok", "anthropic"]) {
    if (configured.includes(fallback)) {
      return createProviderAsync(fallback, fallback === requested ? config.model : undefined);
    }
  }

  if (configured.length > 0) {
    return createProviderAsync(configured[0]!, config.model);
  }

  throw new Error(
    "No AI provider configured. Add an API key in Admin → API Keys, or set OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, or GEMINI_API_KEY."
  );
}

/**
 * Resolve a provider for a specific seat.
 * Uses the seatMap assignment if configured; falls back to the global provider.
 */
async function resolveSeatProvider(
  seatId: string,
  config: CourtConfig,
  globalProvider: AIProvider,
  configured: string[],
  litIndex?: number
): Promise<AIProvider> {
  const seatMap = (config as any).seatMap;
  if (!seatMap) return globalProvider;

  let assignment: { provider?: string; model?: string } | undefined;
  if (seatId === "litigant" && litIndex !== undefined) {
    assignment = seatMap.litigants?.[litIndex];
  } else {
    assignment = seatMap[seatId];
  }

  if (!assignment?.provider) return globalProvider;
  const pid = assignment.provider;
  if (!configured.includes(pid)) return globalProvider;

  try {
    return await createProviderAsync(pid, assignment.model);
  } catch {
    return globalProvider;
  }
}

/** Thrown by streamRole when the AI provider itself errors (not an abort). */
class ProviderFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderFailureError";
  }
}

/** Stream a role's response, using real provider token counts when available */
async function streamRole(
  provider: AIProvider,
  messages: ChatMessage[],
  maxTokens: number,
  onChunk: (text: string) => void,
  usage: TokenUsage,
  signal?: AbortSignal
): Promise<string> {
  // Optimistic estimate for input (used only if provider doesn't return real counts)
  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const estimatedInput = charsToTokens(inputChars);

  let output = "";
  try {
    for await (const chunk of provider.streamChat(messages, maxTokens, signal)) {
      if (signal?.aborted) break;
      output += chunk;
      onChunk(chunk);
    }
  } catch (err: any) {
    if (err?.message === "Session aborted by client" || signal?.aborted) throw err;
    throw new ProviderFailureError(err?.message || "Provider error");
  }

  // Use real token counts from provider if available; fall back to char estimation
  const realUsage = provider.getLastUsage?.();
  if (realUsage && (realUsage.inputTokens > 0 || realUsage.outputTokens > 0)) {
    usage.inputTokens += realUsage.inputTokens;
    usage.outputTokens += realUsage.outputTokens;
  } else {
    usage.inputTokens += estimatedInput;
    usage.outputTokens += charsToTokens(output.length);
  }

  return output;
}

export async function runBrainSession(opts: BrainRunOptions): Promise<BrainRunResult> {
  const { question, config, templateSystemPrompt, res, abortSignal, continueFromTranscript, rebuttalContext } = opts;
  const sessionId = opts.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roles = getRoles(config);
  const maxTokens = getMaxOutputTokens(config.responseMode);
  const estimatedCredits = estimateCreditCost(config);

  const configured = await getConfiguredProvidersAsync();
  let globalProvider = await resolveProvider(config, opts.forcedProvider);
  const providerName = globalProvider.name;
  const modelName = config.model ?? "";

  // Per-seat providers — fall back to global provider when seat not configured
  let orchProvider   = await resolveSeatProvider("orchestrator", config, globalProvider, configured);
  let modProvider    = await resolveSeatProvider("moderator",    config, globalProvider, configured);
  let archProvider   = await resolveSeatProvider("architect",    config, globalProvider, configured);
  let buildProvider  = await resolveSeatProvider("builder",      config, globalProvider, configured);
  let auditProvider  = await resolveSeatProvider("auditor",      config, globalProvider, configured);

  // Cumulative token tracker — passed by reference into every streamRole call
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  // ── Provider failover state ───────────────────────────────────────────────
  // If a provider errors mid-run we silently switch the whole session to the
  // next available configured provider and emit one `provider_failover` SSE
  // event so the client can pin subsequent turns to the backup.
  let failoverTriggered = false;

  async function triggerFailover(failedProviderName: string): Promise<boolean> {
    if (failoverTriggered) return true; // already on backup
    const backupName = configured.find((n) => n !== failedProviderName);
    if (!backupName) return false;
    failoverTriggered = true;
    const backup = await createProviderAsync(backupName);
    globalProvider = backup;
    if (orchProvider.name   === failedProviderName) orchProvider   = backup;
    if (modProvider.name    === failedProviderName) modProvider    = backup;
    if (archProvider.name   === failedProviderName) archProvider   = backup;
    if (buildProvider.name  === failedProviderName) buildProvider  = backup;
    if (auditProvider.name  === failedProviderName) auditProvider  = backup;
    sendSSE(res, { type: "provider_failover", provider: backupName });
    console.info(`[brainEngine] provider failover: ${failedProviderName} → ${backupName} (session ${opts.sessionId ?? "new"})`);
    return true;
  }

  /**
   * Calls streamRole with the given provider. On ProviderFailureError, triggers
   * failover to a backup provider and retries once. Falls back to an inline
   * error string only when no backup is available.
   */
  async function callRole(
    p: AIProvider,
    messages: ChatMessage[],
    maxTokens: number,
    onChunk: (text: string) => void,
  ): Promise<string> {
    try {
      return await streamRole(p, messages, maxTokens, onChunk, usage, abortSignal);
    } catch (err: any) {
      if (err?.message === "Session aborted by client" || abortSignal?.aborted) throw err;
      if (err instanceof ProviderFailureError || err?.name === "ProviderFailureError") {
        const swapped = await triggerFailover(p.name);
        if (swapped) {
          try {
            return await streamRole(globalProvider, messages, maxTokens, onChunk, usage, abortSignal);
          } catch (retryErr: any) {
            if (retryErr?.message === "Session aborted by client" || abortSignal?.aborted) throw retryErr;
            // Both providers failed — fall through to error string
          }
        }
        const fallback = `[${err?.message || "Provider error"}]`;
        onChunk(fallback);
        return fallback;
      }
      throw err;
    }
  }

  sendSSE(res, { type: "start", sessionId, estimatedCredits, provider: providerName });

  // Pre-populate transcript when continuing a paused session
  const transcript: string[] = continueFromTranscript ? [...continueFromTranscript] : [];
  const turns: TurnRecord[] = [];
  let confidence = 20;

  // ── Case File briefing — injected before the question ───────────────────────
  const { caseFile } = opts;
  const caseFileBlock =
    caseFile && caseFile.length > 0
      ? "\n\n── COURT EVIDENCE (Case File) ──\nThe following documents and sources have been entered into evidence by the user before this session. All seats must treat this material as authoritative factual context for their analysis.\n\n" +
        caseFile
          .map(
            (item, i) =>
              `[Evidence ${i + 1}] ${item.name}${item.url ? ` (${item.url})` : ""}\n\n${item.content}`
          )
          .join("\n\n---\n\n") +
        "\n\n── END OF COURT EVIDENCE ──"
      : "";

  const baseContext = rebuttalContext
    ? `You are participating in a structured multi-AI reasoning session.\n\nOriginal question: "${question}"\n\nThe court previously delivered this verdict:\n\n${rebuttalContext.originalVerdict}\n\nThe user has challenged the verdict (Rebuttal Round ${rebuttalContext.rebuttalRound}):\n\n"${rebuttalContext.challenge}"\n\nThe court must reconvene and re-examine the question in light of this challenge. Every litigant must directly address the objection raised. Determine whether the original verdict should be upheld, amended, or reversed.${caseFileBlock}`
    : templateSystemPrompt
    ? `${templateSystemPrompt}\n\nThe question or task under examination: "${question}"${caseFileBlock}`
    : `You are participating in a structured multi-AI reasoning session.\n\nThe question under examination: "${question}"${caseFileBlock}`;

  // Conscience gate — Canon v2 "Execution-Honest" truth mandate
  // Loaded from Firestore system_config/conscience with 5-min TTL; falls back to Canon v2 hardcoded text.
  const { text: conscienceText, version: conscienceVersion } =
    config.conscience !== false
      ? await getConscienceClause()
      : { text: "", version: "disabled" };
  const conscienceClause = conscienceText;

  // ── Seat briefs — loaded from files with optional Firestore override ───────
  const seatBriefs = await getAllSeatBriefs();

  // ── Orchestrator — skipped when continuing a paused session ──────────────────
  if (!continueFromTranscript?.length) {
    throwIfAborted(abortSignal);
    sendSSE(res, { type: "role_start", role: "Orchestrator", roleIndex: -1, round: 0, provider: providerName });

    const orchMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${seatBriefs.orchestrator}\n\nContext: ${baseContext}${conscienceClause}`,
      },
      {
        role: "user",
        content: rebuttalContext
          ? `This is Rebuttal Round ${rebuttalContext.rebuttalRound}. The user has challenged the court's verdict with: "${rebuttalContext.challenge}". Litigants: ${roles.map((r) => r.name).join(", ")}. Acknowledge the challenge, state precisely what the court will re-examine, and route the litigants to address the specific objection.`
          : `Litigants: ${roles.map((r) => r.name).join(", ")}. Frame the session and route to the Moderator.`,
      },
    ];

    const orchestratorFrame = await callRole(
      orchProvider, orchMessages, 400,
      (chunk) => sendSSE(res, { type: "content", role: "Orchestrator", content: chunk }),
    );

    transcript.push(`**Orchestrator:** ${orchestratorFrame}`);
    turns.push({ role: "Orchestrator", round: 0, content: orchestratorFrame });
    sendSSE(res, { type: "role_end", role: "Orchestrator", fullContent: orchestratorFrame });
  }

  // ── Debate rounds ─────────────────────────────────────────────────────────────
  // Skipped entirely when resuming a paused-pre-pipeline session — the debate
  // already happened; the user raised their cap and wants only the fixed pipeline.
  const debateNotesList: string[] = [];
  const creditCap = config.maxCredits ?? Infinity;
  let creditCapHit = false;

  if (!opts.resumeWithFixedPipeline) {
    for (let round = 1; round <= config.maxIterations; round++) {
      throwIfAborted(abortSignal);
      sendSSE(res, { type: "round_start", round });

      const previousTranscript = transcript.join("\n\n");

      for (let i = 0; i < roles.length; i++) {
        throwIfAborted(abortSignal);

        const role = roles[i];
        const litProvider = await resolveSeatProvider("litigant", config, globalProvider, configured, i);
        sendSSE(res, { type: "role_start", role: role.name, roleIndex: i, round, provider: litProvider.name });

        // In independent mode each agent only sees its OWN prior turns —
        // it can build on its own reasoning across rounds but cannot hear
        // what the other seats argued. This keeps input tokens flat (no
        // transcript compounding) while still letting positions evolve.
        const myPriorTurns = turns
          .filter((t) => t.role === role.name)
          .map((t) => `Round ${t.round}: ${t.content}`)
          .join("\n\n");

        const messages: ChatMessage[] = [
          {
            role: "system",
            content: `${seatBriefs.litigant}\n\n${baseContext}\n\nYour assigned role this session: ${role.persona}. ${role.instruction}${getDebateModeClause(config.debateMode)}${conscienceClause}`,
          },
          {
            role: "user",
            content: (() => {
              const isIndependent = config.aiReasoning === "independent";
              if (round === 1 && i === 0) return `Begin your examination of the question.`;
              if (isIndependent) {
                const ownHistory = myPriorTurns
                  ? `Your previous arguments:\n\n${myPriorTurns}\n\nNow give your round ${round} argument as ${role.persona}. Build on your own reasoning — you have not heard the other seats.`
                  : `Give your opening argument as ${role.persona}. Reason independently.`;
                return ownHistory;
              }
              return `Previous discussion:\n\n${previousTranscript}\n\nNow give your ${round > 1 ? "follow-up" : "opening"} argument as ${role.persona}. ${i > 0 ? `Respond to what has been said, especially by ${roles.slice(0, i).map((r) => r.name).join(" and ")}.` : ""}`;
            })(),
          },
        ];

        const roleOutput = await callRole(
          litProvider, messages, maxTokens,
          (chunk) => sendSSE(res, { type: "content", role: role.name, content: chunk }),
        );

        throwIfAborted(abortSignal);

        transcript.push(`**${role.name} (Round ${round}):** ${roleOutput}`);
        debateNotesList.push(`### ${role.name} — Round ${round}\n${roleOutput}`);
        turns.push({ role: role.name, round, content: roleOutput });

        sendSSE(res, { type: "role_end", role: role.name, fullContent: roleOutput });

        confidence = Math.min(
          config.confidenceTarget,
          20 + (round * roles.length + i + 1) * Math.floor((config.confidenceTarget - 20) / (config.maxIterations * roles.length))
        );

        // Stream live credit update based on actual tokens so far
        const creditsUsedSoFar = calculateActualCredits(modelName || "gpt-5", usage.inputTokens, usage.outputTokens);
        sendSSE(res, { type: "confidence_update", confidence, creditsUsed: creditsUsedSoFar });

        // Credit cap — stop debate before the fixed pipeline (not after it)
        if (creditsUsedSoFar >= creditCap) {
          creditCapHit = true;
          break;
        }
      }

      sendSSE(res, { type: "round_end", round, confidence });
      if (creditCapHit) break;
      if (confidence >= config.confidenceTarget && round >= 2) break;
    }
  }

  // Snapshot cumulative usage at end of debate. The delta from here to the end of the
  // session captures the five fixed pipeline stages (Moderator, Architect, Builder,
  // Auditor, Verdict). Saved to Firestore so getCalibratedFixedStageTokens() can
  // learn real averages from the last 50 sessions instead of using hardcoded priors.
  const usageAfterDebate = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };

  // ── Determine why we stopped ──────────────────────────────────────────────
  const pauseReason: PauseReason | undefined = creditCapHit
    ? "credit_cap"
    : confidence < config.confidenceTarget
    ? "iteration_limit"
    : undefined;

  const debateTranscript = transcript.join("\n\n");

  // ── Moderator — collect and synthesise the deliberation ───────────────────
  // When resuming the fixed pipeline, the Moderator already ran in the original
  // paused session. Its summary is already in the provided transcript — extract
  // it instead of calling the AI again.
  let moderatorSummary: string;

  if (opts.resumeWithFixedPipeline) {
    const modEntry = transcript.find((l) => l.startsWith("**Moderator (Summary):**"));
    moderatorSummary = modEntry
      ? modEntry.replace(/^\*\*Moderator \(Summary\):\*\*\s*/, "")
      : transcript.join("\n\n"); // fallback: treat full transcript as context
  } else {
    throwIfAborted(abortSignal);
    sendSSE(res, { type: "role_start", role: "Moderator", roleIndex: -2, round: 99, provider: modProvider.name });

    // When the credit cap was hit mid-debate, prompt Moderator to synthesise a
    // partial / degraded answer from whatever the court produced. This ensures
    // the user always sees a real answer, not a blank card.
    const { relayContext } = opts;
    const moderatorUserContent = creditCapHit
      ? `The court debate was cut short because the credit cap was reached. Here is the partial debate transcript:\n\n${debateTranscript}\n\nThe debate is incomplete. Synthesise the best possible answer from the arguments that were made. Start with a clear note that this is a partial analysis. Summarise the key points of agreement and disagreement, identify the strongest argument on each side, and state the most defensible conclusion you can draw from what was debated. Be explicit about the limitations caused by the incomplete debate.\n\nDeclare ARTIFACT_NEEDED: yes or ARTIFACT_NEEDED: no based on whether the question requires a structured document.`
      : relayContext
      ? `You are operating in relay mode (relay round ${relayContext.relayRound}). The Auditor previously flagged that a determinative fact was missing. The user has now supplied the missing information.\n\nOriginal debate transcript:\n\n${relayContext.originalTranscript.join("\n\n")}\n\nUser's new information:\n\n"${relayContext.missingInfo}"\n\nReview the original transcript in light of this new information. Produce an updated deliberation summary incorporating the new information.\n\nThen declare:\n- ARTIFACT_NEEDED: yes or ARTIFACT_NEEDED: no\n- SUBSTANTIVE: yes (if the new information materially changes the debate outcome and warrants a fresh debate round) or SUBSTANTIVE: no (if the new information can be incorporated directly into the synthesis without re-debating)`
      : `The courtroom deliberation is complete. Here is the full debate transcript:\n\n${debateTranscript}\n\nProduce your deliberation summary. Identify points of consensus, genuine disagreement, the strongest argument on each side, and any logical gaps.\n\nThen declare ARTIFACT_NEEDED: yes or ARTIFACT_NEEDED: no based on whether the question requires a structured deliverable document (report, memo, plan, code, etc.) or whether a synthesised text answer is sufficient.`;

    const moderatorMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${seatBriefs.moderator}\n\n${baseContext}${conscienceClause}`,
      },
      {
        role: "user",
        content: moderatorUserContent,
      },
    ];

    moderatorSummary = await callRole(
      modProvider, moderatorMessages, 800,
      (chunk) => sendSSE(res, { type: "content", role: "Moderator", content: chunk }),
    );

    transcript.push(`**Moderator (Summary):** ${moderatorSummary}`);
    turns.push({ role: "Moderator", round: 99, content: moderatorSummary });
    sendSSE(res, { type: "role_end", role: "Moderator", fullContent: moderatorSummary });

    // ── Credit cap: stop here — Architect/Builder/Auditor/Verdict stay gated ──
    // The user sees the Moderator's degraded answer on the pause card.
    // They can raise their cap and resume (resumeWithFixedPipeline:true) to run
    // the full Architect→Builder→Auditor→Verdict pipeline seeded from this summary.
    if (creditCapHit) {
      const creditsUsed = calculateActualCredits(modelName || "gpt-5", usage.inputTokens, usage.outputTokens);
      sendSSE(res, {
        type: "paused_post_moderator",
        sessionId,
        confidence,
        creditsUsed,
        finalAnswer: moderatorSummary,
        debateTranscriptLines: transcript,
        debateNotes: debateNotesList.join("\n\n---\n\n"),
        pauseReason: "credit_cap",
      });
      return {
        sessionId,
        confidence,
        creditsUsed,
        finalAnswer: moderatorSummary,
        debateNotes: debateNotesList.join("\n\n---\n\n"),
        transcript,
        caveats: "⚠️ Partial analysis — the credit cap was reached before the full verdict pipeline ran. Raise your cap and continue to get the complete structured answer.",
        artifacts: "",
        turns,
        provider: providerName,
        model: modelName,
        tokenUsage: usage,
        conscienceVersion,
        pauseReason: "credit_cap",
        fixedStageTokens: { input: 0, output: 0 },
        artifactPath: "artifact" as const,
        courtroomOutcome: { reason: "credit_cap" as const, confidenceAtExit: confidence, round: config.maxIterations },
        relayCount: opts.relayContext?.relayRound ?? 0,
      };
    }
  }

  // ── Route: artifact vs no-artifact ───────────────────────────────────────
  // Parse the Moderator's ARTIFACT_NEEDED declaration.
  // Falls back to "yes" (artifact path) when absent so old prompts don't break.
  const artifactNeeded = !/ARTIFACT_NEEDED:\s*no\b/i.test(moderatorSummary);

  // Relay count: how many prior relay rounds have accumulated.
  const relayCount = opts.relayContext?.relayRound ?? 0;

  // When the Moderator declared ARTIFACT_NEEDED: no, or we are in relay mode
  // (which always stays on the no-artifact path), skip Architect + Builder.
  let artifactPath: "artifact" | "no-artifact" = artifactNeeded ? "artifact" : "no-artifact";
  // Relay mode always uses the no-artifact path.
  if (opts.relayContext) artifactPath = "no-artifact";

  // ── No-artifact path: Auditor reviews Moderator synthesis directly ────────
  let noArtifactApproved = false;
  let noArtifactRelayQuestion = "";
  let noArtifactFinalSynthesis = moderatorSummary;

  if (artifactPath === "no-artifact") {
    throwIfAborted(abortSignal);
    sendSSE(res, { type: "role_start", role: "Auditor (Release)", roleIndex: -5, round: 99, provider: auditProvider.name });

    const noArtifactAuditorPrompt =
      `Moderator's synthesised answer:\n\n${moderatorSummary}\n\n` +
      `Full debate transcript (for accuracy checking):\n\n${transcript.join("\n\n")}\n\n` +
      `You are operating in Mode B (no-artifact review). Check the synthesis for accuracy against the transcript, completeness, and unsupported claims.\n\n` +
      `Output APPROVED or NOT_ENOUGH as your first line, then follow the Mode B output format.`;

    const noArtifactAuditMessages: ChatMessage[] = [
      { role: "system", content: `${seatBriefs.auditor}\n\n${baseContext}${conscienceClause}` },
      { role: "user",   content: noArtifactAuditorPrompt },
    ];

    const noArtifactAuditOutput = await callRole(
      auditProvider, noArtifactAuditMessages, 800,
      (chunk) => sendSSE(res, { type: "content", role: "Auditor (Release)", content: chunk }),
    );

    transcript.push(`**Auditor (Release):** ${noArtifactAuditOutput}`);
    turns.push({ role: "Auditor (Release)", round: 99, content: noArtifactAuditOutput });
    sendSSE(res, { type: "role_end", role: "Auditor (Release)", fullContent: noArtifactAuditOutput });

    const noArtifactDecision = noArtifactAuditOutput.match(/^(APPROVED|NOT_ENOUGH)\b/im)?.[1]?.toUpperCase() ?? "APPROVED";
    noArtifactApproved = noArtifactDecision === "APPROVED";

    if (noArtifactApproved) {
      // Extract the corrected synthesis text from Auditor output
      const synthMatch = noArtifactAuditOutput.match(/APPROVED[^\n]*\n+([\s\S]+)/i);
      noArtifactFinalSynthesis = synthMatch ? synthMatch[1].trim() : moderatorSummary;
    } else {
      // NOT_ENOUGH: extract what the user must supply
      const missingMatch = noArtifactAuditOutput.match(/##\s+Missing Information\s*\n([\s\S]*?)(?=\n##\s|$)/i);
      noArtifactRelayQuestion = missingMatch
        ? missingMatch[1].trim()
        : "The court requires additional information to complete its answer. Please provide more detail.";
    }
  }

  // ── Emit courtroom_outcome SSE (no-artifact path) ─────────────────────────
  // For the artifact path this is emitted after the convergence loop below.
  if (artifactPath === "no-artifact") {
    const outcomeReason = noArtifactApproved ? "approved" : "not_enough";
    const courtroomOutcomePayload: CourtroomOutcome = {
      reason: outcomeReason,
      confidenceAtExit: confidence,
      round: config.maxIterations,
    };
    sendSSE(res, { type: "courtroom_outcome", courtroomOutcome: courtroomOutcomePayload, artifactPath });
  }

  // ── Artifact path: Architect — design the artifact blueprint ─────────────
  throwIfAborted(abortSignal);
  if (artifactPath === "artifact") sendSSE(res, { type: "role_start", role: "Architect", roleIndex: -3, round: 99, provider: archProvider.name });

  let finalArtifact = "";
  let auditorOutput = "";
  let convergenceFailure = false;

  if (artifactPath === "artifact") {
    const architectMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${seatBriefs.architect}\n\n${baseContext}${conscienceClause}`,
      },
      {
        role: "user",
        content: `The Moderator has produced this deliberation summary:\n\n${moderatorSummary}\n\nOriginal question: "${question}"\n\n${
          config.artifactType && config.artifactType !== "auto"
            ? `REQUIRED ARTIFACT TYPE: The user has explicitly requested a **${config.artifactType}**. You MUST design the blueprint for this specific document type — do not choose a different format. Design the section structure, tone, and audience for a ${config.artifactType} specifically.\n\n`
            : ""
        }Design the blueprint for the artifact the Builder will construct. Specify: document type, section headings, what goes in each section, tone, and audience. Be explicit and complete.`,
      },
    ];

    const architectBlueprint = await callRole(
      archProvider, architectMessages, 600,
      (chunk) => sendSSE(res, { type: "content", role: "Architect", content: chunk }),
    );

    transcript.push(`**Architect (Blueprint):** ${architectBlueprint}`);
    turns.push({ role: "Architect", round: 99, content: architectBlueprint });
    sendSSE(res, { type: "role_end", role: "Architect", fullContent: architectBlueprint });

    // ── Architect / Builder / Auditor — 3-cycle convergence loop ─────────────
    const MAX_BUILD_CYCLES = 3;
    let currentBlueprint = architectBlueprint;

    for (let cycle = 1; cycle <= MAX_BUILD_CYCLES; cycle++) {
      throwIfAborted(abortSignal);

      // ── Builder ─────────────────────────────────────────────────────────────
      const buildLabel = cycle === 1 ? "Builder" : `Builder (Rebuild ${cycle - 1})`;
      sendSSE(res, { type: "role_start", role: buildLabel, roleIndex: -4, round: 99, provider: buildProvider.name, cycle });

      const builderMessages: ChatMessage[] = [
        { role: "system", content: `${seatBriefs.builder}\n\n${baseContext}${conscienceClause}` },
        {
          role: "user",
          content: cycle === 1
            ? `Architect's blueprint:\n\n${currentBlueprint}\n\nModerator's deliberation summary:\n\n${moderatorSummary}\n\nBuild the artifact exactly to spec. Deliver the complete, production-ready document.`
            : `The Auditor returned the previous artifact. The Architect has reworked the blueprint to address the concerns.\n\n## Revised Blueprint\n${currentBlueprint}\n\n## Moderator's Deliberation Summary\n${moderatorSummary}\n\nBuild the artifact exactly to the revised blueprint. Deliver the complete, production-ready document.`,
        },
      ];

      let builtArtifact = await callRole(
        buildProvider, builderMessages, 1800,
        (chunk) => sendSSE(res, { type: "content", role: buildLabel, content: chunk }),
      );

      transcript.push(`**${cycle === 1 ? "Builder (Artifact)" : buildLabel}:** ${builtArtifact}`);
      turns.push({ role: buildLabel, round: 99, content: builtArtifact });
      sendSSE(res, { type: "role_end", role: buildLabel, fullContent: builtArtifact, cycle });

      // ── Architect review ─────────────────────────────────────────────────────
      throwIfAborted(abortSignal);
      sendSSE(res, { type: "role_start", role: "Architect (Review)", roleIndex: -3, round: 99, provider: archProvider.name, cycle });

      const archReviewMessages: ChatMessage[] = [
        { role: "system", content: `${seatBriefs.architect}\n\n${baseContext}${conscienceClause}` },
        {
          role: "user",
          content: `You designed this blueprint:\n\n${currentBlueprint}\n\nThe Builder has delivered this artifact:\n\n${builtArtifact}\n\nCheck the artifact against your blueprint. Is every section present and correctly executed? Does the format, tone, and audience match what you specified?\n\nOutput format:\n1. First line: PASS or REWORK\n2. If REWORK: follow with a ## Correction Notes section listing the specific deviations Builder must fix\n3. Do not re-output the artifact — only your assessment`,
        },
      ];

      const archReviewOutput = await callRole(
        archProvider, archReviewMessages, 400,
        (chunk) => sendSSE(res, { type: "content", role: "Architect (Review)", content: chunk }),
      );

      transcript.push(`**Architect (Review, Cycle ${cycle}):** ${archReviewOutput}`);
      turns.push({ role: "Architect (Review)", round: 99, content: archReviewOutput });
      sendSSE(res, { type: "role_end", role: "Architect (Review)", fullContent: archReviewOutput, cycle });

      const archDecision = archReviewOutput.match(/^(PASS|REWORK)\b/im)?.[1]?.toUpperCase() ?? "PASS";
      if (archDecision === "REWORK") {
        throwIfAborted(abortSignal);
        sendSSE(res, { type: "role_start", role: "Builder (Correction)", roleIndex: -4, round: 99, provider: buildProvider.name, cycle });

        const correctionNotes = archReviewOutput.match(/##\s+Correction Notes\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1]?.trim()
          ?? archReviewOutput;

        const correctionMessages: ChatMessage[] = [
          { role: "system", content: `${seatBriefs.builder}\n\n${baseContext}${conscienceClause}` },
          {
            role: "user",
            content: `The Architect has reviewed your artifact and found these deviations from the blueprint:\n\n## Architect's Correction Notes\n${correctionNotes}\n\n## Blueprint\n${currentBlueprint}\n\n## Your Previous Artifact\n${builtArtifact}\n\nFix every deviation exactly. Deliver the complete, corrected, production-ready document.`,
          },
        ];

        builtArtifact = await callRole(
          buildProvider, correctionMessages, 1800,
          (chunk) => sendSSE(res, { type: "content", role: "Builder (Correction)", content: chunk }),
        );

        transcript.push(`**Builder (Correction, Cycle ${cycle}):** ${builtArtifact}`);
        turns.push({ role: "Builder (Correction)", round: 99, content: builtArtifact });
        sendSSE(res, { type: "role_end", role: "Builder (Correction)", fullContent: builtArtifact, cycle });
      }

      // ── Auditor — quality gate ───────────────────────────────────────────────
      throwIfAborted(abortSignal);
      const auditLabel = cycle === 1 ? "Auditor (Release)" : `Auditor (Cycle ${cycle})`;
      sendSSE(res, { type: "role_start", role: auditLabel, roleIndex: -5, round: 99, provider: auditProvider.name, cycle });

      const isLastCycle = cycle === MAX_BUILD_CYCLES;
      const auditorUserPrompt =
        `Architect's blueprint:\n\n${currentBlueprint}\n\nBuilder's artifact:\n\n${builtArtifact}\n\nModerator's deliberation summary (for fact-checking):\n\n${moderatorSummary}\n\nReview the artifact. Check completeness, accuracy, and alignment with the blueprint. Add or correct the Caveats section if needed.` +
        (isLastCycle
          ? "\n\nThis is the final review cycle (cycle 3 of 3). If you issue RETURNED, include a ## Convergence Diagnosis section explaining what specific information or clarification from the user would resolve the remaining gaps — this will be surfaced to the user directly."
          : "") +
        `\n\nOutput format:\n1. Start with your release decision on its own line: APPROVED or RETURNED\n2. If RETURNED, follow with a ## Revision Notes section (specific issues for the next cycle)` +
        (isLastCycle ? ", then a ## Convergence Diagnosis section (what user input would unblock convergence)" : "") +
        `\n3. Then output the complete artifact text — output the artifact as-is on APPROVED, or your lightly corrected version on RETURNED`;

      const auditorMessages: ChatMessage[] = [
        { role: "system", content: `${seatBriefs.auditor}\n\n${baseContext}${conscienceClause}` },
        { role: "user",   content: auditorUserPrompt },
      ];

      auditorOutput = await callRole(
        auditProvider, auditorMessages, 1200,
        (chunk) => sendSSE(res, { type: "content", role: auditLabel, content: chunk }),
      );

      transcript.push(`**${auditLabel}:** ${auditorOutput}`);
      turns.push({ role: auditLabel, round: 99, content: auditorOutput });
      sendSSE(res, { type: "role_end", role: auditLabel, fullContent: auditorOutput, cycle });

      const auditDecision = auditorOutput.match(/^(APPROVED|RETURNED)\b/im)?.[1]?.toUpperCase() ?? "APPROVED";

      if (auditDecision === "APPROVED") {
        const artifactMatch = auditorOutput.match(/APPROVED[^\n]*\n+([\s\S]+)/i);
        finalArtifact = artifactMatch ? artifactMatch[1].trim() : builtArtifact;
        break;
      }

      finalArtifact = builtArtifact;

      if (isLastCycle) {
        convergenceFailure = true;
        sendSSE(res, { type: "convergence_failure", sessionId, cycle });
        break;
      }

      // ── Architect reworks blueprint for next cycle ───────────────────────────
      throwIfAborted(abortSignal);
      sendSSE(res, { type: "role_start", role: "Architect (Blueprint)", roleIndex: -3, round: 99, provider: archProvider.name, cycle });

      const auditRevisionNotes = auditorOutput.match(/##\s+Revision Notes\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1]?.trim()
        ?? auditorOutput;

      const blueprintReworkMessages: ChatMessage[] = [
        { role: "system", content: `${seatBriefs.architect}\n\n${baseContext}${conscienceClause}` },
        {
          role: "user",
          content: `The Auditor has returned the artifact with these revision notes:\n\n${auditRevisionNotes}\n\n## Your Current Blueprint\n${currentBlueprint}\n\n## Moderator's Deliberation Summary\n${moderatorSummary}\n\nRework the blueprint to directly address the Auditor's concerns. Stay grounded in the original question and Moderator's summary — fixing the gaps is not license to expand scope. Output the complete, revised blueprint.`,
        },
      ];

      currentBlueprint = await callRole(
        archProvider, blueprintReworkMessages, 600,
        (chunk) => sendSSE(res, { type: "content", role: "Architect (Blueprint)", content: chunk }),
      );

      transcript.push(`**Architect (Blueprint Rework, Cycle ${cycle}):** ${currentBlueprint}`);
      turns.push({ role: "Architect (Blueprint)", round: 99, content: currentBlueprint });
      sendSSE(res, { type: "role_end", role: "Architect (Blueprint)", fullContent: currentBlueprint, cycle });
    }

    // Emit courtroom_outcome for the artifact path
    const artifactOutcomeReason: CourtroomOutcome["reason"] = convergenceFailure ? "convergence_failure" : "approved";
    const artifactCourtroomOutcome: CourtroomOutcome = {
      reason: artifactOutcomeReason,
      confidenceAtExit: confidence,
      round: config.maxIterations,
    };
    sendSSE(res, { type: "courtroom_outcome", courtroomOutcome: artifactCourtroomOutcome, artifactPath });
  }

  // ── Build final courtroomOutcome object ──────────────────────────────────────
  const courtroomOutcome: CourtroomOutcome = artifactPath === "no-artifact"
    ? {
        reason: noArtifactApproved ? "approved" : "not_enough",
        confidenceAtExit: confidence,
        round: config.maxIterations,
      }
    : {
        reason: convergenceFailure ? "convergence_failure" : "approved",
        confidenceAtExit: confidence,
        round: config.maxIterations,
      };

  // ── Orchestrator — deliver verdict to user ────────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Verdict", roleIndex: 99, round: 99, provider: orchProvider.name });

  // Craft Orchestrator prompt based on which path we took
  const orchestratorUserContent = artifactPath === "no-artifact"
    ? noArtifactApproved
      // APPROVED no-artifact: Orchestrator delivers the synthesised answer
      ? `The court has completed its work without building a document — the answer is self-contained.\n\nModerator's synthesised answer (Auditor-approved):\n\n${noArtifactFinalSynthesis}\n\nDeliver this answer to the user clearly and directly. Lead with the direct answer, then briefly explain the court's reasoning. Do not manufacture a document — the answer IS the deliverable.`
      // NOT_ENOUGH: Orchestrator relays the missing-information question to the user
      : `The court has determined it cannot fully answer the question without additional information from the user.\n\nModerator's synthesis so far:\n\n${moderatorSummary}\n\nAuditor's missing information flag:\n\n${noArtifactRelayQuestion}\n\nInform the user clearly that the court needs this specific information before it can deliver a complete answer. Ask the question precisely. Explain why this information is determinative.`
    // Artifact path: standard verdict delivery
    : `The court has completed its work. Here is the Moderator's summary:\n\n${moderatorSummary}\n\nHere is the Auditor-approved artifact:\n\n${finalArtifact}\n\nDeliver the verdict to the user: lead with a direct answer, summarise the key reasons in 2-3 sentences, present the artifact, and close with your standard save prompt asking if they would like to keep a copy in their files.`;

  const orchestratorCloseMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${seatBriefs.orchestrator}\n\n${baseContext}${conscienceClause}`,
    },
    {
      role: "user",
      content: orchestratorUserContent,
    },
  ];

  const finalAnswer = await callRole(
    orchProvider, orchestratorCloseMessages, 1000,
    (chunk) => sendSSE(res, { type: "content", role: "Verdict", content: chunk }),
  );

  // Extract caveats from auditor output or final answer
  const caveatMatch = auditorOutput.match(/##\s+Caveats?\s*\n([\s\S]*?)(?=\n##\s|$)/i)
    ?? finalAnswer.match(/##\s+(?:Sources &|Caveats?)\s*(?:Caveats?)?\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const caveats = caveatMatch
    ? caveatMatch[1].trim()
    : "This analysis represents AI-generated reasoning and should not substitute for professional advice.";

  confidence = Math.min(95, confidence + 5);

  turns.push({ role: "Verdict", round: 99, content: finalAnswer });

  // Final actual credit calculation from real token counts
  const creditsUsed = calculateActualCredits(
    modelName || "gpt-5",
    usage.inputTokens,
    usage.outputTokens
  );

  // The delivered artifact: for no-artifact APPROVED path, this is the synthesis.
  // For no-artifact NOT_ENOUGH and artifact paths, use finalArtifact as-is.
  const deliveredArtifact = artifactPath === "no-artifact" && noArtifactApproved
    ? noArtifactFinalSynthesis
    : finalArtifact;

  // The relay question surfaces to the frontend when NOT_ENOUGH.
  const relayQuestion = artifactPath === "no-artifact" && !noArtifactApproved
    ? noArtifactRelayQuestion
    : undefined;

  sendSSE(res, { type: "role_end", role: "Verdict", fullContent: finalAnswer });
  sendSSE(res, {
    type: "done",
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript: transcript.join("\n\n---\n\n"),
    transcriptLines: transcript,
    caveats,
    artifacts: deliveredArtifact,
    provider: providerName,
    model: modelName,
    tokenUsage: usage,
    conscienceVersion,
    artifactPath,
    courtroomOutcome,
    relayCount,
    ...(relayQuestion ? { relayQuestion, needsRelay: true } : {}),
    ...(pauseReason ? { pauseReason } : {}),
    ...(convergenceFailure ? { convergenceFailure } : {}),
    ...(relayCount >= 1 ? { endOfJobTap: null } : {}),
  });

  return {
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript,
    caveats,
    artifacts: deliveredArtifact,
    turns,
    provider: providerName,
    model: modelName,
    tokenUsage: usage,
    conscienceVersion,
    pauseReason,
    ...(convergenceFailure ? { convergenceFailure } : {}),
    artifactPath,
    courtroomOutcome,
    relayCount,
    ...(relayQuestion ? { relayQuestion } : {}),
    ...(relayCount >= 1 ? { endOfJobTap: null as "worth_it" | "not_worth_it" | null } : {}),
    fixedStageTokens: {
      input:  usage.inputTokens  - usageAfterDebate.inputTokens,
      output: usage.outputTokens - usageAfterDebate.outputTokens,
    },
  };
}
