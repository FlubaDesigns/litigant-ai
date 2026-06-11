import OpenAI from "openai";
import type { Response } from "express";

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] || "placeholder",
});

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

function getTokensForMode(responseMode: ResponseMode): number {
  return { balanced: 600, thorough: 1200, concise: 300 }[responseMode];
}

function sendSSE(res: Response, event: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

export function estimateCreditCost(config: CourtConfig): number {
  const litigants = Math.min(config.litigantCount, 4);
  return litigants * config.maxIterations * 3 + 7; // +7 for Orchestrator + Verdict
}

export interface BrainRunOptions {
  question: string;
  config: CourtConfig;
  templateId?: string;
  templateSystemPrompt?: string;
  sessionId?: string;
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
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Session aborted by client");
}

export async function runBrainSession(opts: BrainRunOptions): Promise<BrainRunResult> {
  const { question, config, templateSystemPrompt, res, abortSignal } = opts;
  const sessionId = opts.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roles = getRoles(config);
  const maxTokens = getTokensForMode(config.responseMode);
  const estimatedCredits = estimateCreditCost(config);

  sendSSE(res, { type: "start", sessionId, estimatedCredits });

  const transcript: string[] = [];
  const turns: TurnRecord[] = [];
  let creditsUsed = 0;
  let confidence = 20;

  const baseContext = templateSystemPrompt
    ? `${templateSystemPrompt}\n\nThe question or task under examination: "${question}"`
    : `You are participating in a structured multi-AI reasoning session.\n\nThe question under examination: "${question}"`;

  // ── Orchestrator frame ──────────────────────────────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Orchestrator", roleIndex: -1, round: 0 });
  let orchestratorFrame = "";

  try {
    const orchStream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 400,
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are the Orchestrator of a multi-AI reasoning courtroom. Frame the trial, identify the core contested questions, and set expectations for the debate. Be concise (3-4 sentences max).",
        },
        {
          role: "user",
          content: `${baseContext}\n\nCourt mode: ${config.courtMode}. Litigants: ${roles.map((r) => r.name).join(", ")}. Frame the session.`,
        },
      ],
    });

    for await (const chunk of orchStream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        orchestratorFrame += content;
        sendSSE(res, { type: "content", role: "Orchestrator", content });
      }
    }
  } catch {
    orchestratorFrame = `[Courtroom convened — examining: "${question}"]`;
    sendSSE(res, { type: "content", role: "Orchestrator", content: orchestratorFrame });
  }

  transcript.push(`**Orchestrator:** ${orchestratorFrame}`);
  turns.push({ role: "Orchestrator", round: 0, content: orchestratorFrame });
  sendSSE(res, { type: "role_end", role: "Orchestrator", fullContent: orchestratorFrame });
  creditsUsed += 1;

  // ── Debate rounds ───────────────────────────────────────────────────────────
  const debateNotesList: string[] = [];

  for (let round = 1; round <= config.maxIterations; round++) {
    throwIfAborted(abortSignal);
    sendSSE(res, { type: "round_start", round });

    const previousTranscript = transcript.join("\n\n");

    for (let i = 0; i < roles.length; i++) {
      throwIfAborted(abortSignal);

      const role = roles[i];
      sendSSE(res, { type: "role_start", role: role.name, roleIndex: i, round });

      let roleOutput = "";

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `${baseContext}\n\nYour role: ${role.persona}. ${role.instruction}\n\nBe sharp, specific, and argumentative. Do not be vague. Target: ${maxTokens} tokens.`,
        },
        {
          role: "user",
          content:
            round === 1 && i === 0
              ? `Begin your examination of the question.`
              : `Previous discussion:\n\n${previousTranscript}\n\nNow give your ${round > 1 ? "follow-up" : "opening"} argument as ${role.persona}. ${i > 0 ? `Respond to what has been said, especially by ${roles.slice(0, i).map((r) => r.name).join(" and ")}.` : ""}`,
        },
      ];

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-5.4",
          max_completion_tokens: maxTokens,
          stream: true,
          messages,
        });

        for await (const chunk of stream) {
          if (abortSignal?.aborted) break;
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            roleOutput += content;
            sendSSE(res, { type: "content", role: role.name, content });
          }
        }
        throwIfAborted(abortSignal);
      } catch (err: any) {
        if (err?.message === "Session aborted by client") throw err;
        const fallback = `[${role.name} unable to respond — ${err?.message || "API error"}]`;
        roleOutput = fallback;
        sendSSE(res, { type: "content", role: role.name, content: fallback });
      }

      transcript.push(`**${role.name} (Round ${round}):** ${roleOutput}`);
      debateNotesList.push(`### ${role.name} — Round ${round}\n${roleOutput}`);
      turns.push({ role: role.name, round, content: roleOutput });

      sendSSE(res, { type: "role_end", role: role.name, fullContent: roleOutput });
      creditsUsed += Math.ceil(maxTokens / 200);

      confidence = Math.min(
        config.confidenceTarget,
        20 + (round * roles.length + i + 1) * Math.floor((config.confidenceTarget - 20) / (config.maxIterations * roles.length))
      );
      sendSSE(res, { type: "confidence_update", confidence, creditsUsed });
    }

    sendSSE(res, { type: "round_end", round, confidence });
    if (confidence >= config.confidenceTarget && round >= 2) break;
  }

  // ── Final Verdict ───────────────────────────────────────────────────────────
  throwIfAborted(abortSignal);
  sendSSE(res, { type: "role_start", role: "Verdict", roleIndex: 99, round: 99 });

  let finalAnswer = "";
  let caveats = "";
  let artifacts = "";

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

  try {
    const verdictStream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1600,
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are the Synthesizer — the final judge in a multi-AI courtroom. Deliver a comprehensive, balanced verdict incorporating all perspectives. Be definitive where evidence is clear, honest about uncertainty where it remains. Always produce all four sections.",
        },
        { role: "user", content: verdictPrompt },
      ],
    });

    for await (const chunk of verdictStream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        finalAnswer += content;
        sendSSE(res, { type: "content", role: "Verdict", content });
      }
    }
  } catch (err: any) {
    finalAnswer = `## Final Answer\n\nBased on the debate, "${question}" has been examined from ${roles.length} perspectives. Review the transcript for detailed arguments.\n\n## Artifacts\n\nNo structured artifact could be generated due to an error.\n\n## Sources & Caveats\n\nThis analysis is AI-generated. [Error: ${err?.message || "API error"}]`;
    sendSSE(res, { type: "content", role: "Verdict", content: finalAnswer });
  }

  // Extract sections
  const artifactsMatch = finalAnswer.match(/##\s+Artifacts\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (artifactsMatch) {
    artifacts = artifactsMatch[1].trim();
  }

  const caveatMatch = finalAnswer.match(/##\s+(?:Sources &|Sources &amp;|Caveats?|Sources)\s+Caveats?\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (caveatMatch) {
    caveats = caveatMatch[1].trim();
  } else {
    caveats = "This analysis represents AI-generated reasoning and should not substitute for professional advice in legal, medical, financial, or safety-critical domains.";
  }

  // Extract clean final answer (up to Key Findings or Artifacts)
  const answerMatch = finalAnswer.match(/##\s+Final Answer\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const cleanFinalAnswer = answerMatch ? answerMatch[1].trim() : finalAnswer;

  creditsUsed += 6;
  confidence = Math.min(95, confidence + 5);

  turns.push({ role: "Verdict", round: 99, content: finalAnswer });

  sendSSE(res, { type: "role_end", role: "Verdict", fullContent: finalAnswer });
  sendSSE(res, {
    type: "done",
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer: cleanFinalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript: transcript.join("\n\n---\n\n"),
    caveats,
    artifacts,
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
  };
}
