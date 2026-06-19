import type { Response } from "express";
import { createProviderAsync, getConfiguredProvidersAsync } from "./providers/index.js";
import type { AIProvider, ChatMessage, ProviderName } from "./providers/index.js";
import {
  estimateSessionCredits,
  calculateActualCredits,
  charsToTokens,
} from "./creditEngine.js";

export type CourtMode = "adversarial" | "socratic" | "analysis" | "critique";
export type ResponseMode = "balanced" | "thorough" | "concise";
export type OutputFormat = "report" | "memo" | "bullets" | "verdict";

export interface CourtConfig {
  courtMode: CourtMode;
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
  const modePersonas: Record<CourtMode, RoleDefinition[]> = {
    adversarial: [
      { name: "Advocate", persona: "Advocate", instruction: "Build the strongest possible case FOR the proposition. Present evidence, logic, and examples. Be persuasive." },
      { name: "Skeptic", persona: "Skeptic", instruction: "Challenge and attack the proposition with the strongest counterarguments. Find weaknesses in the Advocate's reasoning. Be rigorous." },
      { name: "Devil's Advocate", persona: "Devil's Advocate", instruction: "Take the most contrarian and uncomfortable position. Challenge both sides. Expose hidden assumptions." },
      { name: "Empiricist", persona: "Empiricist", instruction: "Evaluate claims strictly on empirical evidence and data. Reject unsupported assertions from all sides." },
    ],
    socratic: [
      { name: "Questioner", persona: "Questioner", instruction: "Ask probing Socratic questions that reveal hidden assumptions and logical gaps in the proposition." },
      { name: "Defender", persona: "Defender", instruction: "Defend and clarify the proposition in response to Socratic questioning. Refine and strengthen arguments." },
      { name: "Synthesizer", persona: "Synthesizer", instruction: "Identify what has been established, what remains contested, and what new understanding has emerged." },
      { name: "Logician", persona: "Logician", instruction: "Map the logical structure of arguments. Identify valid inferences, fallacies, and unsupported leaps." },
    ],
    analysis: [
      { name: "Analyst", persona: "Analyst", instruction: "Systematically analyze all dimensions of the question: historical context, current state, trends, and implications." },
      { name: "Contrarian", persona: "Contrarian", instruction: "Identify what the conventional analysis misses. Surface non-obvious insights and underexplored angles." },
      { name: "Realist", persona: "Realist", instruction: "Ground the analysis in practical reality. Challenge theoretical arguments with real-world constraints." },
      { name: "Futurist", persona: "Futurist", instruction: "Project forward: what are the second and third-order effects? What does this imply long-term?" },
    ],
    critique: [
      { name: "Critic", persona: "Critic", instruction: "Identify every flaw, weakness, and unsupported assumption. Be thorough and relentless." },
      { name: "Defender", persona: "Defender", instruction: "Defend the subject against criticism. Show what the critics miss or exaggerate." },
      { name: "Balanced Reviewer", persona: "Balanced Reviewer", instruction: "Give a fair, balanced assessment incorporating both criticisms and defenses." },
      { name: "Standards Expert", persona: "Standards Expert", instruction: "Evaluate against professional standards and best practices in the relevant field." },
    ],
  };

  const allRoles = modePersonas[config.courtMode];
  return allRoles.slice(0, Math.min(config.litigantCount, allRoles.length));
}

function getMaxOutputTokens(responseMode: ResponseMode): number {
  return { balanced: 600, thorough: 1200, concise: 300 }[responseMode];
}

function sendSSE(res: Response, event: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
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

export interface BrainRunOptions {
  question: string;
  config: CourtConfig;
  templateId?: string;
  templateSystemPrompt?: string;
  sessionId?: string;
  /** When continuing a paused session, pass the accumulated transcript lines. */
  continueFromTranscript?: string[];
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
  /** Present when the session stopped before hitting the confidence target. */
  pauseReason?: PauseReason;
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

/** Stream a role's response, tracking output character count for token estimation */
async function streamRole(
  provider: AIProvider,
  messages: ChatMessage[],
  maxTokens: number,
  onChunk: (text: string) => void,
  usage: TokenUsage,
  signal?: AbortSignal
): Promise<string> {
  // Estimate input tokens from message content length
  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  usage.inputTokens += charsToTokens(inputChars);

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

  // Track actual output tokens
  usage.outputTokens += charsToTokens(output.length);

  return output;
}

export async function runBrainSession(opts: BrainRunOptions): Promise<BrainRunResult> {
  const { question, config, templateSystemPrompt, res, abortSignal, continueFromTranscript } = opts;
  const sessionId = opts.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roles = getRoles(config);
  const maxTokens = getMaxOutputTokens(config.responseMode);
  const estimatedCredits = estimateCreditCost(config);

  const provider = await resolveProvider(config);
  const providerName = provider.name;
  const modelName = config.model ?? "";

  // Cumulative token tracker — passed by reference into every streamRole call
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  sendSSE(res, { type: "start", sessionId, estimatedCredits, provider: providerName });

  // Pre-populate transcript when continuing a paused session
  const transcript: string[] = continueFromTranscript ? [...continueFromTranscript] : [];
  const turns: TurnRecord[] = [];
  let confidence = 20;

  const baseContext = templateSystemPrompt
    ? `${templateSystemPrompt}\n\nThe question or task under examination: "${question}"`
    : `You are participating in a structured multi-AI reasoning session.\n\nThe question under examination: "${question}"`;

  // Conscience gate — Canon v2 "Execution-Honest" truth mandate
  // This is not a politeness filter. It forces the AI to say what is actually true.
  const conscienceClause = config.conscience !== false
    ? `\n\nCONSCIENCE MANDATE — EXECUTION-HONEST (Canon v2):
Apply these checks before outputting. Violations must be corrected, not softened.
(1) TRUTH FIRST: State what the evidence actually shows. If the honest conclusion is uncomfortable or unwelcome, say it plainly. Do not soften, hedge, or bury it.
(2) VERIFY BEFORE ASSERTING: Only claim what you can actually substantiate. If you are uncertain, say so explicitly — "I don't know" is a valid and required answer when true.
(3) NO DIPLOMATIC EVASION: Do not give a balanced non-answer to avoid conflict. If one side is stronger, say so. If something is wrong, say it is wrong.
(4) EXPOSE GAPS: State what information is missing that would materially change the conclusion. Do not imply completeness you don't have.
(5) EXECUTION-HONEST: If your reasoning led you somewhere you didn't expect, report it. Do not reverse-engineer your argument to fit a predetermined conclusion.`
    : "";

  // ── Orchestrator — skipped when continuing a paused session ──────────────────
  if (!continueFromTranscript?.length) {
    throwIfAborted(abortSignal);
    sendSSE(res, { type: "role_start", role: "Orchestrator", roleIndex: -1, round: 0, provider: providerName });

    const orchMessages: ChatMessage[] = [
      {
        role: "system",
        content: `You are the Orchestrator of a multi-AI reasoning courtroom. Frame the trial, identify the core contested questions, and set expectations for the debate. Be concise (3-4 sentences max).${conscienceClause}`,
      },
      {
        role: "user",
        content: `${baseContext}\n\nCourt mode: ${config.courtMode}. Litigants: ${roles.map((r) => r.name).join(", ")}. Frame the session.`,
      },
    ];

    const orchestratorFrame = await streamRole(
      provider, orchMessages, 400,
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
      sendSSE(res, { type: "role_start", role: role.name, roleIndex: i, round, provider: providerName });

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `${baseContext}\n\nYour role: ${role.persona}. ${role.instruction}\n\nBe sharp, specific, and argumentative. Do not be vague.${conscienceClause}`,
        },
        {
          role: "user",
          content: (() => {
            const isIndependent = config.aiReasoning === "independent";
            if (round === 1 && i === 0) return `Begin your examination of the question.`;
            if (isIndependent) {
              return `Give your ${round > 1 ? "follow-up" : "opening"} argument as ${role.persona}. Think independently — do not assume you know what others have argued.`;
            }
            return `Previous discussion:\n\n${previousTranscript}\n\nNow give your ${round > 1 ? "follow-up" : "opening"} argument as ${role.persona}. ${i > 0 ? `Respond to what has been said, especially by ${roles.slice(0, i).map((r) => r.name).join(" and ")}.` : ""}`;
          })(),
        },
      ];

      const roleOutput = await streamRole(
        provider, messages, maxTokens,
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
      const creditsUsedSoFar = calculateActualCredits(modelName || "gpt-4o", usage.inputTokens, usage.outputTokens);
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

  // ── Determine why we stopped ──────────────────────────────────────────────
  const pauseReason: PauseReason | undefined = creditCapHit
    ? "credit_cap"
    : confidence < config.confidenceTarget
    ? "iteration_limit"
    : undefined;

  // ── Final Verdict ─────────────────────────────────────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Verdict", roleIndex: 99, round: 99, provider: providerName });

  const verdictPrompt = `${baseContext}

You have observed the following structured debate:

${transcript.join("\n\n")}

Now deliver the complete final output. Structure it with these EXACT section headers:

## Final Answer
A clear, direct response (2-4 paragraphs). Lead with a definitive position where warranted.

## Key Findings
3-5 bullet points summarising the most important conclusions.

## Artifacts
Provide concrete, immediately usable output based on the debate. This could be:
- A prioritised action checklist if the question is a decision
- A structured analysis table if the question is evaluative
- A decision memo if the question is strategic
- A risk matrix if the question involves risk assessment
Format this as a practical work product the user can use directly.

## Sources & Caveats
What assumptions underlie this analysis? What would change the verdict? What professional expertise should be consulted? List key limitations.

Output format: ${config.outputFormat}`;

  const verdictMessages: ChatMessage[] = [
    {
      role: "system",
      content: `You are the Synthesizer — the final judge in a multi-AI courtroom. Deliver a comprehensive, balanced verdict incorporating all perspectives. Be definitive where evidence is clear, honest about uncertainty where it remains. Always produce all four sections.${conscienceClause}`,
    },
    { role: "user", content: verdictPrompt },
  ];

  const finalAnswer = await streamRole(
    provider, verdictMessages, 1600,
    (chunk) => sendSSE(res, { type: "content", role: "Verdict", content: chunk }),
    usage, abortSignal
  );

  // Extract sections
  const artifactsMatch = finalAnswer.match(/##\s+Artifacts\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const artifacts = artifactsMatch ? artifactsMatch[1].trim() : "";

  const caveatMatch = finalAnswer.match(/##\s+(?:Sources &|Sources &amp;|Caveats?|Sources)\s+Caveats?\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const caveats = caveatMatch
    ? caveatMatch[1].trim()
    : "This analysis represents AI-generated reasoning and should not substitute for professional advice.";

  const answerMatch = finalAnswer.match(/##\s+Final Answer\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const cleanFinalAnswer = answerMatch ? answerMatch[1].trim() : finalAnswer;

  confidence = Math.min(95, confidence + 5);

  turns.push({ role: "Verdict", round: 99, content: finalAnswer });

  // Final actual credit calculation from real token counts
  const creditsUsed = calculateActualCredits(
    modelName || "gpt-4o",
    usage.inputTokens,
    usage.outputTokens
  );

  sendSSE(res, { type: "role_end", role: "Verdict", fullContent: finalAnswer });
  sendSSE(res, {
    type: "done",
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer: cleanFinalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript: transcript.join("\n\n---\n\n"),
    transcriptLines: transcript,
    caveats,
    artifacts,
    provider: providerName,
    model: modelName,
    tokenUsage: usage,
    ...(pauseReason ? { pauseReason } : {}),
  });

  return {
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer: cleanFinalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript,
    caveats,
    artifacts,
    turns,
    provider: providerName,
    model: modelName,
    tokenUsage: usage,
    pauseReason,
  };
}
