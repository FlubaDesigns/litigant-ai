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

function getRoles(config: CourtConfig, question: string): RoleDefinition[] {
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

export interface BrainRunOptions {
  question: string;
  config: CourtConfig;
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
}

export async function runBrainSession(opts: BrainRunOptions): Promise<BrainRunResult> {
  const { question, config, templateSystemPrompt, res } = opts;
  const sessionId = opts.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roles = getRoles(config, question);
  const maxTokens = getTokensForMode(config.responseMode);
  const estimatedCredits = roles.length * config.maxIterations * 3 + 5;

  sendSSE(res, { type: "start", sessionId, estimatedCredits });

  const transcript: string[] = [];
  const roleOutputs: Record<string, string[]> = {};
  let creditsUsed = 0;
  let confidence = 20;

  const baseContext = templateSystemPrompt
    ? `${templateSystemPrompt}\n\nThe question or task under examination: "${question}"`
    : `You are participating in a structured multi-AI reasoning session.\n\nThe question under examination: "${question}"`;

  // ── Orchestrator frame ─────────────────────────────────────────────────────
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
          content:
            "You are the Orchestrator of a multi-AI reasoning courtroom. Frame the trial, identify the core contested questions, and set expectations for the debate. Be concise (3-4 sentences max).",
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
  } catch (err: any) {
    sendSSE(res, { type: "content", role: "Orchestrator", content: `[Session framed — proceeding to examination of: "${question}"]` });
    orchestratorFrame = `Examining: "${question}"`;
  }

  transcript.push(`**Orchestrator:** ${orchestratorFrame}`);
  sendSSE(res, { type: "role_end", role: "Orchestrator", fullContent: orchestratorFrame });
  creditsUsed += 1;

  // ── Debate rounds ──────────────────────────────────────────────────────────
  const debateNotesList: string[] = [];

  for (let round = 1; round <= config.maxIterations; round++) {
    sendSSE(res, { type: "round_start", round });

    const previousTranscript = transcript.join("\n\n");

    for (let i = 0; i < roles.length; i++) {
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
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            roleOutput += content;
            sendSSE(res, { type: "content", role: role.name, content });
          }
        }
      } catch (err: any) {
        const fallback = `[${role.name} unable to respond — ${err?.message || "API error"}]`;
        roleOutput = fallback;
        sendSSE(res, { type: "content", role: role.name, content: fallback });
      }

      if (!roleOutputs[role.name]) roleOutputs[role.name] = [];
      roleOutputs[role.name].push(roleOutput);
      transcript.push(`**${role.name} (Round ${round}):** ${roleOutput}`);
      debateNotesList.push(`### ${role.name} — Round ${round}\n${roleOutput}`);

      sendSSE(res, { type: "role_end", role: role.name, fullContent: roleOutput });
      creditsUsed += Math.ceil(maxTokens / 200);

      // update confidence after each round
      confidence = Math.min(
        config.confidenceTarget,
        20 + (round * roles.length + i + 1) * Math.floor((config.confidenceTarget - 20) / (config.maxIterations * roles.length))
      );
      sendSSE(res, { type: "confidence_update", confidence, creditsUsed });
    }

    sendSSE(res, { type: "round_end", round, confidence });

    if (confidence >= config.confidenceTarget && round >= 2) break;
  }

  // ── Final Verdict ──────────────────────────────────────────────────────────
  sendSSE(res, { type: "role_start", role: "Verdict", roleIndex: 99, round: 99 });

  let finalAnswer = "";
  let caveats = "";

  const verdictPrompt = `${baseContext}

You have observed the following structured debate:\n\n${transcript.join("\n\n")}

Now deliver the final verdict as the Synthesizer:
1. **Final Answer**: A clear, direct response to the original question (2-4 paragraphs)
2. **Key Findings**: The 3-5 most important conclusions from the debate
3. **Confidence Assessment**: Rate confidence ${confidence}% and explain key uncertainties
4. **Caveats & Limitations**: What this analysis cannot account for

Output format (${config.outputFormat}):
${config.outputFormat === "bullets" ? "Use bullet points throughout." : ""}
${config.outputFormat === "verdict" ? "Lead with a one-sentence verdict, then elaborate." : ""}
${config.outputFormat === "memo" ? "Write as a professional decision memo." : ""}
${config.outputFormat === "report" ? "Write as a structured analytical report." : ""}`;

  try {
    const verdictStream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1200,
      stream: true,
      messages: [
        { role: "system", content: "You are the Synthesizer — the final judge in a multi-AI courtroom. Deliver a comprehensive, balanced verdict that incorporates all perspectives from the debate. Be definitive where evidence is clear, honest about uncertainty where it remains." },
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
    finalAnswer = `[Verdict generation failed: ${err?.message || "API error"}]\n\nBased on the debate, the question "${question}" has been examined from multiple perspectives. Review the transcript for the individual role outputs.`;
    sendSSE(res, { type: "content", role: "Verdict", content: finalAnswer });
  }

  // Extract caveats section if present
  const caveatMatch = finalAnswer.match(/(?:Caveats?|Limitations?)[:\s]+([^#]+?)(?=\n#|\n\*\*|$)/is);
  if (caveatMatch) {
    caveats = caveatMatch[1].trim();
  } else {
    caveats = "This analysis represents AI-generated reasoning and should not substitute for professional advice in legal, medical, financial, or safety-critical domains.";
  }

  creditsUsed += 6;
  confidence = Math.min(95, confidence + 5);

  sendSSE(res, { type: "role_end", role: "Verdict", fullContent: finalAnswer });
  sendSSE(res, {
    type: "done",
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript: transcript.join("\n\n---\n\n"),
    caveats,
  });

  return {
    sessionId,
    confidence,
    creditsUsed,
    finalAnswer,
    debateNotes: debateNotesList.join("\n\n---\n\n"),
    transcript,
    caveats,
  };
}
