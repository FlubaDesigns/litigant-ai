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
   */
  fixedStageTokens: { input: number; output: number };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Session aborted by client");
}

async function resolveProvider(config: CourtConfig): Promise<AIProvider> {
  const configured = await getConfiguredProvidersAsync();

  const requested = config.provider as string | undefined;
  if (requested && configured.includes(requested)) {
    return createProviderAsync(requested, config.model);
  }

  for (const fallback of ["openai", "anthropic", "grok", "gemini"]) {
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
    const fallback = `[${err?.message || "Provider error"}]`;
    output = fallback;
    onChunk(fallback);
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
  const provider = await resolveProvider(config);
  const providerName = provider.name;
  const modelName = config.model ?? "";

  // Per-seat providers — fall back to global provider when seat not configured
  const orchProvider   = await resolveSeatProvider("orchestrator", config, provider, configured);
  const modProvider    = await resolveSeatProvider("moderator",    config, provider, configured);
  const archProvider   = await resolveSeatProvider("architect",    config, provider, configured);
  const buildProvider  = await resolveSeatProvider("builder",      config, provider, configured);
  const auditProvider  = await resolveSeatProvider("auditor",      config, provider, configured);

  // Cumulative token tracker — passed by reference into every streamRole call
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

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

    const orchestratorFrame = await streamRole(
      orchProvider, orchMessages, 400,
      (chunk) => sendSSE(res, { type: "content", role: "Orchestrator", content: chunk }),
      usage, abortSignal
    );

    transcript.push(`**Orchestrator:** ${orchestratorFrame}`);
    turns.push({ role: "Orchestrator", round: 0, content: orchestratorFrame });
    sendSSE(res, { type: "role_end", role: "Orchestrator", fullContent: orchestratorFrame });
  }

  // ── Debate rounds ─────────────────────────────────────────────────────────────
  const debateNotesList: string[] = [];
  const creditCap = config.maxCredits ?? Infinity;
  let creditCapHit = false;

  for (let round = 1; round <= config.maxIterations; round++) {
    throwIfAborted(abortSignal);
    sendSSE(res, { type: "round_start", round });

    const previousTranscript = transcript.join("\n\n");

    for (let i = 0; i < roles.length; i++) {
      throwIfAborted(abortSignal);

      const role = roles[i];
      const litProvider = await resolveSeatProvider("litigant", config, provider, configured, i);
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

      const roleOutput = await streamRole(
        litProvider, messages, maxTokens,
        (chunk) => sendSSE(res, { type: "content", role: role.name, content: chunk }),
        usage, abortSignal
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

      // Credit cap — stop debate early and fall through to partial verdict
      if (creditsUsedSoFar >= creditCap) {
        creditCapHit = true;
        break;
      }
    }

    sendSSE(res, { type: "round_end", round, confidence });
    if (creditCapHit) break;
    if (confidence >= config.confidenceTarget && round >= 2) break;
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
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Moderator", roleIndex: -2, round: 99, provider: modProvider.name });

  const moderatorMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${seatBriefs.moderator}\n\n${baseContext}${conscienceClause}`,
    },
    {
      role: "user",
      content: `The courtroom deliberation is complete. Here is the full debate transcript:\n\n${debateTranscript}\n\nProduce your deliberation summary. Identify points of consensus, genuine disagreement, the strongest argument on each side, and any logical gaps. Then brief the Architect on what deliverable this question requires.`,
    },
  ];

  const moderatorSummary = await streamRole(
    modProvider, moderatorMessages, 800,
    (chunk) => sendSSE(res, { type: "content", role: "Moderator", content: chunk }),
    usage, abortSignal
  );

  transcript.push(`**Moderator (Summary):** ${moderatorSummary}`);
  turns.push({ role: "Moderator", round: 99, content: moderatorSummary });
  sendSSE(res, { type: "role_end", role: "Moderator", fullContent: moderatorSummary });

  // ── Architect — design the artifact blueprint ─────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Architect", roleIndex: -3, round: 99, provider: archProvider.name });

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

  const architectBlueprint = await streamRole(
    archProvider, architectMessages, 600,
    (chunk) => sendSSE(res, { type: "content", role: "Architect", content: chunk }),
    usage, abortSignal
  );

  transcript.push(`**Architect (Blueprint):** ${architectBlueprint}`);
  turns.push({ role: "Architect", round: 99, content: architectBlueprint });
  sendSSE(res, { type: "role_end", role: "Architect", fullContent: architectBlueprint });

  // ── Builder → Auditor retry loop ─────────────────────────────────────────
  // The Auditor is a real quality gate. If it returns RETURNED, the artifact
  // goes back to the Builder with the Auditor's specific feedback for a revision
  // pass. Capped at MAX_AUDITOR_RETRIES to bound cost and latency.
  // On exhausting retries the last Auditor output is used as-is.
  const MAX_AUDITOR_RETRIES = 2;

  // ── Builder — initial build ───────────────────────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Builder", roleIndex: -4, round: 99, provider: buildProvider.name, attempt: 1 });

  const initialBuilderMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${seatBriefs.builder}\n\n${baseContext}${conscienceClause}`,
    },
    {
      role: "user",
      content: `Architect's blueprint:\n\n${architectBlueprint}\n\nModerator's deliberation summary:\n\n${moderatorSummary}\n\nBuild the artifact exactly to spec. Deliver the complete, production-ready document.`,
    },
  ];

  let builtArtifact = await streamRole(
    buildProvider, initialBuilderMessages, 1800,
    (chunk) => sendSSE(res, { type: "content", role: "Builder", content: chunk }),
    usage, abortSignal
  );

  transcript.push(`**Builder (Artifact):** ${builtArtifact}`);
  turns.push({ role: "Builder", round: 99, content: builtArtifact });
  sendSSE(res, { type: "role_end", role: "Builder", fullContent: builtArtifact, attempt: 1 });

  // ── Auditor retry loop ────────────────────────────────────────────────────
  let auditorOutput = "";
  let finalArtifact  = builtArtifact;

  for (let attempt = 1; attempt <= 1 + MAX_AUDITOR_RETRIES; attempt++) {
    throwIfAborted(abortSignal);

    // ── Auditor — review ────────────────────────────────────────────────────
    sendSSE(res, { type: "role_start", role: "Auditor", roleIndex: -5, round: 99, provider: auditProvider.name, attempt });

    const auditorUserPrompt = attempt === 1
      ? `Architect's blueprint:\n\n${architectBlueprint}\n\nBuilder's artifact:\n\n${builtArtifact}\n\nModerator's deliberation summary (for fact-checking):\n\n${moderatorSummary}\n\nReview the artifact. Check completeness, accuracy, and alignment with the blueprint. Add or correct the Caveats section if needed.\n\nOutput format:\n1. Start with your release decision on its own line: APPROVED or RETURNED\n2. If RETURNED, follow immediately with a ## Revision Notes section listing the specific issues the Builder must fix\n3. Then output the complete artifact text (approved as-is, or your corrected version if you found issues)`
      : `Architect's blueprint:\n\n${architectBlueprint}\n\nBuilder's revised artifact (revision ${attempt - 1} of ${MAX_AUDITOR_RETRIES}):\n\n${builtArtifact}\n\nModerator's deliberation summary (for fact-checking):\n\n${moderatorSummary}\n\nRe-review the revised artifact. Have the Builder's corrections addressed your earlier concerns?\n\nOutput format:\n1. Start with your release decision on its own line: APPROVED or RETURNED\n2. If RETURNED, follow immediately with a ## Revision Notes section listing any remaining issues\n3. Then output the complete artifact text`;

    const auditorMessages: ChatMessage[] = [
      { role: "system", content: `${seatBriefs.auditor}\n\n${baseContext}${conscienceClause}` },
      { role: "user",   content: auditorUserPrompt },
    ];

    auditorOutput = await streamRole(
      auditProvider, auditorMessages, 1200,
      (chunk) => sendSSE(res, { type: "content", role: "Auditor", content: chunk }),
      usage, abortSignal
    );

    const auditLabel = attempt === 1 ? "Auditor (Release)" : `Auditor (Re-review ${attempt - 1})`;
    transcript.push(`**${auditLabel}:** ${auditorOutput}`);
    turns.push({ role: "Auditor", round: 99, content: auditorOutput });
    sendSSE(res, { type: "role_end", role: "Auditor", fullContent: auditorOutput, attempt });

    // Parse decision and extract final artifact text
    const decision       = auditorOutput.match(/^(APPROVED|RETURNED)\b/im)?.[1]?.toUpperCase() ?? "APPROVED";
    const artifactMatch  = auditorOutput.match(/(?:APPROVED|RETURNED)[^\n]*\n+(?:##\s+Revision Notes[\s\S]*?\n\n)?([\s\S]+)/i);
    finalArtifact = artifactMatch ? artifactMatch[1].trim() : builtArtifact;

    // APPROVED or out of retries — we're done
    if (decision === "APPROVED" || attempt === 1 + MAX_AUDITOR_RETRIES) break;

    // ── Builder — revision pass ─────────────────────────────────────────────
    throwIfAborted(abortSignal);
    const revisionAttempt = attempt + 1; // Builder revision number (2, 3, …)
    sendSSE(res, { type: "role_start", role: "Builder", roleIndex: -4, round: 99, provider: buildProvider.name, attempt: revisionAttempt });

    // Extract just the Revision Notes from the Auditor output for a focused brief
    const revisionNotes = auditorOutput.match(/##\s+Revision Notes\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1]?.trim()
      ?? auditorOutput;

    const revisionMessages: ChatMessage[] = [
      { role: "system", content: `${seatBriefs.builder}\n\n${baseContext}${conscienceClause}` },
      {
        role: "user",
        content: `The Auditor has reviewed your artifact and returned it for revision (pass ${attempt} of ${MAX_AUDITOR_RETRIES}).\n\n## Auditor's Revision Notes\n${revisionNotes}\n\n## Architect's Blueprint\n${architectBlueprint}\n\n## Your Previous Artifact\n${builtArtifact}\n\nAddress every point in the Revision Notes. Deliver the complete, corrected, production-ready document.`,
      },
    ];

    builtArtifact = await streamRole(
      buildProvider, revisionMessages, 1800,
      (chunk) => sendSSE(res, { type: "content", role: "Builder", content: chunk }),
      usage, abortSignal
    );

    transcript.push(`**Builder (Revision ${attempt}):** ${builtArtifact}`);
    turns.push({ role: "Builder", round: 99, content: builtArtifact });
    sendSSE(res, { type: "role_end", role: "Builder", fullContent: builtArtifact, attempt: revisionAttempt });
  }

  // ── Orchestrator — deliver verdict to user ────────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Verdict", roleIndex: 99, round: 99, provider: orchProvider.name });

  const orchestratorCloseMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${seatBriefs.orchestrator}\n\n${baseContext}${conscienceClause}`,
    },
    {
      role: "user",
      content: `The court has completed its work. Here is the Moderator's summary:\n\n${moderatorSummary}\n\nHere is the Auditor-approved artifact:\n\n${finalArtifact}\n\nDeliver the verdict to the user: lead with a direct answer, summarise the key reasons in 2-3 sentences, present the artifact, and close with your standard save prompt asking if they would like to keep a copy in their files.`,
    },
  ];

  const finalAnswer = await streamRole(
    orchProvider, orchestratorCloseMessages, 1000,
    (chunk) => sendSSE(res, { type: "content", role: "Verdict", content: chunk }),
    usage, abortSignal
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
    artifacts: finalArtifact,
    provider: providerName,
    model: modelName,
    tokenUsage: usage,
    conscienceVersion,
    ...(pauseReason ? { pauseReason } : {}),
  });

  return {
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript,
    caveats,
    artifacts: finalArtifact,
    turns,
    provider: providerName,
    model: modelName,
    tokenUsage: usage,
    conscienceVersion,
    pauseReason,
    fixedStageTokens: {
      input:  usage.inputTokens  - usageAfterDebate.inputTokens,
      output: usage.outputTokens - usageAfterDebate.outputTokens,
    },
  };
}
