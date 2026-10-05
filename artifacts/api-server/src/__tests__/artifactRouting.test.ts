/**
 * Artifact-routing unit tests for brainEngine.ts
 *
 * Covers the ARTIFACT_NEEDED decision point that Moderator emits and the two
 * downstream paths it triggers:
 *
 *   no-artifact path
 *     APPROVED   → deliveredArtifact = noArtifactFinalSynthesis, finalArtifact empty
 *     NOT_ENOUGH → result includes relayQuestion, courtroomOutcome.reason = "not_enough"
 *
 *   artifact path
 *     APPROVED           → courtroomOutcome.reason = "approved", finalArtifact set
 *     convergence_failure→ courtroomOutcome.reason = "convergence_failure"
 *
 * All AI calls are mocked — no real API keys needed. The mock provider returns
 * pre-canned strings in call order so each test controls the exact pipeline
 * dialogue.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks — must be declared before any imports that trigger them
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../lib/providers/index.js", () => ({
  createProviderAsync: vi.fn(),
  getConfiguredProvidersAsync: vi.fn(() => Promise.resolve(["mock"])),
}));

vi.mock("../lib/conscienceConfig.js", () => ({
  getConscienceClause: vi.fn(() =>
    Promise.resolve({ text: "", version: "test-disabled" })
  ),
}));

vi.mock("../lib/seatBriefs.js", () => ({
  getAllSeatBriefs: vi.fn(() =>
    Promise.resolve({
      orchestrator: "You are the orchestrator.",
      moderator:    "You are the moderator.",
      architect:    "You are the architect.",
      builder:      "You are the builder.",
      auditor:      "You are the auditor.",
      litigant:     "You are a litigant.",
    })
  ),
}));

vi.mock("../lib/creditEngine.js", () => ({
  estimateSessionCredits:  vi.fn(() => 100),
  calculateActualCredits:  vi.fn(() => 50),
  charsToTokens:           vi.fn((n: number) => Math.ceil(n / 4)),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { createProviderAsync } from "../lib/providers/index.js";
import { runBrainSession } from "../lib/brainEngine.js";
import type { CourtConfig } from "../lib/brainEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Make a sequential mock provider. Each streamChat call yields the next string. */
function makeProvider(responses: string[]) {
  let idx = 0;
  return {
    name: "mock",
    streamChat: vi.fn(async function* () {
      const text = responses[idx++] ?? "[mock-empty]";
      yield text;
    }) as any,
    getLastUsage: vi.fn(() => ({ inputTokens: 10, outputTokens: 20 })),
  };
}

/** Minimal Express Response mock that captures SSE events. */
function makeMockRes() {
  const events: Record<string, unknown>[] = [];
  const res = {
    writableEnded: false,
    write: vi.fn((data: string) => {
      const match = data.match(/^data: (.+)\n\n$/s);
      if (match) {
        try {
          events.push(JSON.parse(match[1]));
        } catch {
          /* ignore malformed */
        }
      }
      return true;
    }),
    flush: vi.fn(),
    _events: events,
  } as unknown as Response & { _events: Record<string, unknown>[] };
  return res;
}

/** Minimal court config for fast runs: 1 litigant, 1 debate round. */
const BASE_CONFIG: CourtConfig = {
  litigantCount:    1,
  confidenceTarget: 70,
  maxIterations:    1,
  responseMode:     "concise",
  outputFormat:     "verdict",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("ARTIFACT_NEEDED parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to no-artifact path when Moderator emits "ARTIFACT_NEEDED: no"', async () => {
    // Call order: Orchestrator, Litigant, Moderator, Auditor(Release), Verdict
    const provider = makeProvider([
      "The court opens.",                           // Orchestrator
      "Litigant opening argument.",                 // Litigant round 1
      "Summary. ARTIFACT_NEEDED: no",               // Moderator
      "APPROVED\nSynthesised answer text.",         // Auditor (Release)
      "Final verdict delivered.",                   // Verdict
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    const result = await runBrainSession({
      question: "What is the capital of France?",
      config: BASE_CONFIG,
      res,
    });

    expect(result.artifactPath).toBe("no-artifact");
  });

  it('routes to no-artifact path when Moderator emits "ARTIFACT_NEEDED: No" (case-insensitive)', async () => {
    const provider = makeProvider([
      "Orchestrator opens.",
      "Litigant argues.",
      "Deliberation complete. ARTIFACT_NEEDED: No",
      "APPROVED\nAnswer is here.",
      "Final answer.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Is water wet?",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.artifactPath).toBe("no-artifact");
  });

  it('routes to artifact path when Moderator emits "ARTIFACT_NEEDED: yes"', async () => {
    // Call order: Orchestrator, Litigant, Moderator, Architect,
    //             Builder(cycle1), ArchReview(PASS), Auditor(APPROVED), Verdict
    const provider = makeProvider([
      "Orchestrator opens.",
      "Litigant argues.",
      "Deliberation. ARTIFACT_NEEDED: yes",
      "Blueprint: Section 1, Section 2.",
      "Built artifact content.",
      "PASS",
      "APPROVED\nFinal artifact text.",
      "Verdict delivered.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Write me a report on climate change.",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.artifactPath).toBe("artifact");
  });

  it("routes to artifact path when ARTIFACT_NEEDED is absent (fallback = yes)", async () => {
    // Moderator output has no ARTIFACT_NEEDED declaration at all.
    const provider = makeProvider([
      "Orchestrator opens.",
      "Litigant argues.",
      "Here is the deliberation summary with no routing declaration.",
      "Blueprint: Section 1.",
      "Artifact content.",
      "PASS",
      "APPROVED\nApproved artifact.",
      "Final verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Draft a contract template.",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    // When absent, brainEngine defaults to artifact path (safe fallback)
    expect(result.artifactPath).toBe("artifact");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("No-artifact path — APPROVED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets artifacts to the Auditor-approved synthesis (not empty)", async () => {
    const synthesisText = "Paris is the capital of France. Population ~2 million.";
    const provider = makeProvider([
      "Orchestrator opens.",
      "Litigant round 1.",
      "Deliberation complete. ARTIFACT_NEEDED: no",
      `APPROVED\n${synthesisText}`,
      "Final verdict: here is the court's answer.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "What is the capital of France?",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.artifactPath).toBe("no-artifact");
    expect(result.artifacts).toBe(synthesisText);
    expect(result.courtroomOutcome.reason).toBe("approved");
  });

  it("does NOT populate relayQuestion on APPROVED", async () => {
    const provider = makeProvider([
      "Orchestrator opens.",
      "Litigant round 1.",
      "Summary. ARTIFACT_NEEDED: no",
      "APPROVED\nHere is the complete answer.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Simple factual question?",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.relayQuestion).toBeUndefined();
    expect(result.courtroomOutcome.reason).toBe("approved");
  });

  it("emits courtroom_outcome SSE with reason=approved on no-artifact APPROVED", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "Summary. ARTIFACT_NEEDED: no",
      "APPROVED\nAnswer text.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "Quick question?",
      config: BASE_CONFIG,
      res,
    });

    const outcomeEvent = res._events.find((e) => e.type === "courtroom_outcome");
    expect(outcomeEvent).toBeDefined();
    expect((outcomeEvent as any).courtroomOutcome.reason).toBe("approved");
    expect((outcomeEvent as any).artifactPath).toBe("no-artifact");
  });

  it("emits done SSE with artifacts = synthesis text on APPROVED", async () => {
    const synthesis = "The answer is 42.";
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: no",
      `APPROVED\n${synthesis}`,
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "Life, universe, everything?",
      config: BASE_CONFIG,
      res,
    });

    const doneEvent = res._events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect((doneEvent as any).artifacts).toBe(synthesis);
    expect((doneEvent as any).artifactPath).toBe("no-artifact");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("No-artifact path — NOT_ENOUGH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets relayQuestion from ## Missing Information section", async () => {
    const missingInfo = "What jurisdiction does the user operate in?";
    const auditorOutput =
      `NOT_ENOUGH\nThe court cannot proceed without more information.\n` +
      `## Missing Information\n${missingInfo}\n`;
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "Deliberation. ARTIFACT_NEEDED: no",
      auditorOutput,
      "Verdict — court asks for more info.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Is my contract enforceable?",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.relayQuestion).toBe(missingInfo);
    expect(result.courtroomOutcome.reason).toBe("not_enough");
    expect(result.artifactPath).toBe("no-artifact");
  });

  it("falls back to a default relay question when ## Missing Information is absent", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: no",
      "NOT_ENOUGH\nSomething is missing but no section header provided.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Tell me about my legal situation.",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.relayQuestion).toBeDefined();
    expect(typeof result.relayQuestion).toBe("string");
    expect(result.relayQuestion!.length).toBeGreaterThan(0);
    expect(result.courtroomOutcome.reason).toBe("not_enough");
  });

  it("emits done SSE with needsRelay=true and relayQuestion on NOT_ENOUGH", async () => {
    const missingInfo = "Which city does the user live in?";
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: no",
      `NOT_ENOUGH\n## Missing Information\n${missingInfo}`,
      "Verdict — need info.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "What local rules apply?",
      config: BASE_CONFIG,
      res,
    });

    const doneEvent = res._events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect((doneEvent as any).needsRelay).toBe(true);
    expect((doneEvent as any).relayQuestion).toBe(missingInfo);
  });

  it("emits courtroom_outcome SSE with reason=not_enough on NOT_ENOUGH", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: no",
      "NOT_ENOUGH\n## Missing Information\nMore details needed.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "Ambiguous question requiring clarification.",
      config: BASE_CONFIG,
      res,
    });

    const outcomeEvent = res._events.find((e) => e.type === "courtroom_outcome");
    expect(outcomeEvent).toBeDefined();
    expect((outcomeEvent as any).courtroomOutcome.reason).toBe("not_enough");
  });

  it("does NOT emit convergence_failure SSE on NOT_ENOUGH", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: no",
      "NOT_ENOUGH\n## Missing Information\nSpecify the contract date.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "What are my rights?",
      config: BASE_CONFIG,
      res,
    });

    const convergenceEvent = res._events.find((e) => e.type === "convergence_failure");
    expect(convergenceEvent).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Artifact path — standard behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces finalArtifact from Auditor-approved output on APPROVED", async () => {
    const artifactText = "# Climate Report\n\nSection 1: Overview\n...";
    const provider = makeProvider([
      "Orchestrator opens.",
      "Litigant argues.",
      "Deliberation complete. ARTIFACT_NEEDED: yes",
      "Blueprint: Intro, Body, Conclusion.",
      "Draft artifact body.",
      "PASS",
      `APPROVED\n${artifactText}`,
      "Here is your report.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Write a climate change report.",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.artifactPath).toBe("artifact");
    expect(result.artifacts).toBe(artifactText);
    expect(result.courtroomOutcome.reason).toBe("approved");
  });

  it("emits courtroom_outcome SSE with reason=approved on artifact APPROVED", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: yes",
      "Blueprint.",
      "Artifact draft.",
      "PASS",
      "APPROVED\nFinal artifact content.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "Write a memo.",
      config: BASE_CONFIG,
      res,
    });

    const outcomeEvent = res._events.find((e) => e.type === "courtroom_outcome");
    expect((outcomeEvent as any)?.courtroomOutcome?.reason).toBe("approved");
    expect((outcomeEvent as any)?.artifactPath).toBe("artifact");
  });

  it("does not set relayQuestion on artifact APPROVED path", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: yes",
      "Blueprint.",
      "Artifact.",
      "PASS",
      "APPROVED\nCompleted artifact.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Draft a legal memo.",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.relayQuestion).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Artifact path — convergence failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Simulates 3 Auditor RETURNED decisions to trigger convergence_failure.
   *
   * Call sequence (ArchReview = PASS each time, so Builder Correction is skipped):
   *   Orchestrator, Litigant, Moderator, Architect(blueprint),
   *   Cycle 1: Builder, ArchReview(PASS), Auditor(RETURNED), Arch Blueprint Rework,
   *   Cycle 2: Builder(Rebuild2), ArchReview(PASS), Auditor(Cycle2)(RETURNED), Arch Blueprint Rework,
   *   Cycle 3: Builder(Rebuild3), ArchReview(PASS), Auditor(Cycle3)(RETURNED=last),
   *   Verdict
   */
  it("sets courtroomOutcome.reason = convergence_failure after 3 RETURNED cycles", async () => {
    const provider = makeProvider([
      /* 1  */ "Orchestrator opens.",
      /* 2  */ "Litigant argues.",
      /* 3  */ "Deliberation. ARTIFACT_NEEDED: yes",
      /* 4  */ "Initial blueprint.",
      /* Cycle 1 */
      /* 5  */ "Artifact draft v1.",
      /* 6  */ "PASS",
      /* 7  */ "RETURNED\n## Revision Notes\nMissing data section.",
      /* 8  */ "Revised blueprint v2.",
      /* Cycle 2 */
      /* 9  */ "Artifact draft v2.",
      /* 10 */ "PASS",
      /* 11 */ "RETURNED\n## Revision Notes\nStill incomplete.",
      /* 12 */ "Revised blueprint v3.",
      /* Cycle 3 */
      /* 13 */ "Artifact draft v3.",
      /* 14 */ "PASS",
      /* 15 */ "RETURNED\n## Revision Notes\nStill not right.\n## Convergence Diagnosis\nUser must clarify X.",
      /* 16 */ "Verdict — convergence failed.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const result = await runBrainSession({
      question: "Write an impossible report.",
      config: BASE_CONFIG,
      res: makeMockRes(),
    });

    expect(result.courtroomOutcome.reason).toBe("convergence_failure");
    expect(result.convergenceFailure).toBe(true);
    expect(result.artifactPath).toBe("artifact");
  });

  it("emits convergence_failure SSE event after 3 cycles", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: yes",
      "Blueprint.",
      "Draft v1.", "PASS", "RETURNED\n## Revision Notes\nIssue 1.", "Blueprint v2.",
      "Draft v2.", "PASS", "RETURNED\n## Revision Notes\nIssue 2.", "Blueprint v3.",
      "Draft v3.", "PASS", "RETURNED\n## Revision Notes\nIssue 3.\n## Convergence Diagnosis\nNeed X.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "Impossible task.",
      config: BASE_CONFIG,
      res,
    });

    const convergenceEvent = res._events.find((e) => e.type === "convergence_failure");
    expect(convergenceEvent).toBeDefined();
  });

  it("emits courtroom_outcome SSE with reason=convergence_failure", async () => {
    const provider = makeProvider([
      "Orchestrator.",
      "Litigant.",
      "ARTIFACT_NEEDED: yes",
      "Blueprint.",
      "Draft v1.", "PASS", "RETURNED\n## Revision Notes\nGap 1.", "Blueprint v2.",
      "Draft v2.", "PASS", "RETURNED\n## Revision Notes\nGap 2.", "Blueprint v3.",
      "Draft v3.", "PASS", "RETURNED\n## Revision Notes\nGap 3.\n## Convergence Diagnosis\nNeed Y.",
      "Verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);

    const res = makeMockRes();
    await runBrainSession({
      question: "Unresolvable document.",
      config: BASE_CONFIG,
      res,
    });

    const outcomeEvent = res._events.find((e) => e.type === "courtroom_outcome");
    expect((outcomeEvent as any)?.courtroomOutcome?.reason).toBe("convergence_failure");
  });
});

describe("failure, budget and evidence regressions", () => {
  beforeEach(() => vi.clearAllMocks());
  it("never emits completion or approval when the provider fails", async () => {
    const provider=makeProvider([]);
    provider.streamChat=vi.fn(async function*(){throw new Error("Unavailable");}) as any;
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
    const res=makeMockRes();
    await expect(runBrainSession({question:"Q", config:BASE_CONFIG,res})).rejects.toThrow(/no approved result/);
    expect(res._events.some(e => e.type==="done")).toBe(false);
  });
  it("rejects malformed auditor decisions instead of defaulting to approval", async () => {
    vi.mocked(createProviderAsync).mockResolvedValue(makeProvider(["Open","Argue","ARTIFACT_NEEDED: no","Unclear response"]) as any);
    await expect(runBrainSession({question:"Q",config:BASE_CONFIG,res:makeMockRes()})).rejects.toThrow(/valid release decision/);
  });
  it("keeps the auditor's score after verdict and includes same-round arguments in chain mode", async () => {
    const provider=makeProvider(["Open","First argument has unique evidence","Second argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 61\n## Assessment Basis\nOne source missing.","Verdict"]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,litigantCount:2,aiReasoning:"chain"},res:makeMockRes()});
    expect(provider.streamChat.mock.calls[2][0][1].content).toContain("First argument has unique evidence");
    expect(result.confidence).toBe(61);
    expect(result.courtroomOutcome.reason).toBe("iteration_limit");
    expect(result.caveats).toContain("not a measured probability");
  });
  it("enforces answer-only even if the moderator asks for a document", async () => {
    vi.mocked(createProviderAsync).mockResolvedValue(makeProvider(["Open","Argue","ARTIFACT_NEEDED: yes","APPROVED\nCONFIDENCE: 80","Verdict"]) as any);
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,outputPreferenceMode:"answer-only"},res:makeMockRes()});
    expect(result.artifactPath).toBe("no-artifact");
    expect(result.turns.some(t=>t.role.includes("Builder"))).toBe(false);
  });
  it("stops before a pipeline call that cannot fit the remaining budget", async () => {
    const provider=makeProvider(["Open","Argue","ARTIFACT_NEEDED: yes"]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
    const res=makeMockRes();
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,maxCredits:3},res,deferCompletion:true,
      priceCalls:calls=>calls.length});
    expect(provider.streamChat).toHaveBeenCalledTimes(3);
    expect(result.creditsUsed).toBe(3);
    expect(result.pauseReason).toBe("credit_cap");
    expect(result.courtroomOutcome.reason).toBe("credit_cap");
    expect(res._events.some(e=>e.type==="done"||e.type==="paused_post_moderator")).toBe(false);
  });
});


describe("restored context reaches model prompts", () => {
  it.each(["rebuttal", "relay"])("preserves template instructions and evidence in %s prompts", async kind => {
    vi.clearAllMocks();
    const provider = makeProvider([
      "The court opens.", "Litigant argument.", "Summary. ARTIFACT_NEEDED: no",
      "APPROVED\nSynthesised answer.", "Final verdict.",
    ]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
    await runBrainSession({
      question: "Saved question", config: BASE_CONFIG, res: makeMockRes(),
      templateSystemPrompt: "Evaluate the saved business plan.",
      caseFile: [{ id: "doc", type: "file", name: "plan.txt", content: "Saved revenue evidence" }],
      ...(kind === "rebuttal"
        ? { rebuttalContext: { challenge: "Reconsider", originalVerdict: "Saved verdict", rebuttalRound: 2 } }
        : { relayContext: { missingInfo: "New fact", originalTranscript: ["Saved discussion"], relayRound: 2 } }),
    });
    const messages = provider.streamChat.mock.calls.flatMap((call: any[]) => call[0]);
    const moderatorContext = messages.find((message: any) => message.role === "system" && message.content.includes("You are the moderator."));
    expect(moderatorContext.content).toContain("Evaluate the saved business plan.");
    expect(moderatorContext.content).toContain("Saved revenue evidence");
    if (kind === "rebuttal") expect(moderatorContext.content).toContain("Saved verdict");
    else expect(messages.some((message: any) => message.content.includes("Saved discussion") && message.content.includes("New fact"))).toBe(true);
  });
});

describe("configuration reaches generation", () => {
  it("uses answer style and depth for the moderator and final answer", async () => {
    vi.clearAllMocks();
    const provider=makeProvider(["Open","Argue","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 80","Verdict"]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
    await runBrainSession({question:"Q",config:{...BASE_CONFIG,responseMode:"thorough",outputFormat:"bullets",outputPreferenceMode:"answer-only"},res:makeMockRes()});
    const calls=provider.streamChat.mock.calls;
    expect(calls[2][0][1].content).toContain("USER ANSWER STYLE: Bullet points");
    expect(calls.at(-1)[0][1].content).toContain("RESPONSE DEPTH: thorough");
    expect(calls[1][1]).toBe(1200);
    expect(calls.at(-1)[1]).toBe(1200);
  });
  it("builds the configured document even when the moderator says none is needed", async () => {
    vi.clearAllMocks();
    const provider=makeProvider(["Open","Argue","ARTIFACT_NEEDED: no","Blueprint","Draft","PASS","APPROVED\nCONFIDENCE: 80","Verdict"]);
    vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,outputPreferenceMode:"document",artifactType:"legal-brief"},res:makeMockRes()});
    expect(result.artifactPath).toBe("artifact");
    expect(provider.streamChat.mock.calls[3][0][1].content).toContain("legal-brief");
  });
});

describe("provider fallback recovery", () => {
  it("reaches a working third provider after two authentication failures", async () => {
    vi.clearAllMocks();
    const failure = (name:string) => ({...makeProvider([]),name,streamChat:vi.fn(async function*(){throw Object.assign(new Error("Rejected"),{status:401});}),getLastUsage:()=>null});
    const first=failure("openai"), second=failure("anthropic");
    const third={...makeProvider(["Open","Argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 80","Final answer"]),name:"grok"};
    vi.mocked(createProviderAsync).mockImplementation(async name => ({openai:first,anthropic:second,grok:third}[name] as any));
    const res=makeMockRes();
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,provider:"openai",outputPreferenceMode:"answer-only"},res,enabledProviders:["openai","anthropic","grok"]});
    expect(result.finalAnswer).toBe("Final answer");
    expect(first.streamChat).toHaveBeenCalledTimes(1);
    expect(second.streamChat).toHaveBeenCalledTimes(1);
    expect(res._events.filter(e=>e.type==="provider_failover").map(e=>e.provider)).toEqual(["anthropic","grok"]);
  });
  it("counts an empty billed completion before attempting another provider", async () => {
    vi.clearAllMocks();
    const first={...makeProvider([""]),name:"openai",getLastUsage:()=>({inputTokens:10,outputTokens:400})};
    const backup={...makeProvider(["Should not be called"]),name:"anthropic"};
    vi.mocked(createProviderAsync).mockImplementation(async name => (name==="openai"?first:backup) as any);
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,provider:"openai",maxCredits:1},res:makeMockRes(),enabledProviders:["openai","anthropic"],priceCalls:calls=>calls.filter(c=>c.outputTokens===400).length});
    expect(result.pauseReason).toBe("credit_cap");
    expect(backup.streamChat).not.toHaveBeenCalled();
    expect(result.tokenUsage.calls?.[0].outputTokens).toBe(400);
  });
});


describe("per-agent usage attribution", () => {
  it("tags every seat and keeps failed and fallback calls separate", async () => {
    vi.clearAllMocks();
    const first={...makeProvider([]),name:"openai",model:"o3",streamChat:vi.fn(async function*(){yield "partial";throw new Error("failure");}),getLastUsage:()=>null};
    const backup={...makeProvider(["Open","Argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 80","Final"]),name:"anthropic",model:"claude-sonnet-4-5"};
    vi.mocked(createProviderAsync).mockImplementation(async name=>(name==="openai"?first:backup) as any);
    const onCallUsage=vi.fn();
    const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,provider:"openai",outputPreferenceMode:"answer-only"},res:makeMockRes(),enabledProviders:["openai","anthropic"],onCallUsage});
    expect(result.tokenUsage.calls).toHaveLength(6);
    expect(result.tokenUsage.calls?.[0]).toMatchObject({seat:"Orchestrator",model:"o3",usageSource:"estimated"});
    expect(result.tokenUsage.calls?.[1]).toMatchObject({seat:"Orchestrator",model:"claude-sonnet-4-5",usageSource:"provider"});
    expect(result.tokenUsage.calls?.map(c=>c.seat)).toEqual(["Orchestrator","Orchestrator",expect.any(String),"Moderator","Auditor","Orchestrator"]);
    expect(onCallUsage.mock.calls.map(([call])=>call)).toEqual(result.tokenUsage.calls);
  });
});
