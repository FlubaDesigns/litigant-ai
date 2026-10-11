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
function makeProvider(responses: Array<string | { text: string; status?: string; finishReason?: string; abort?: AbortController }>) {
  let idx = 0;
  let completion = {status: "complete", finishReason: "stop"};
  return {
    model: "mock-model",
    getLastCompletion: () => completion,
    name: "mock",
    streamChat: vi.fn(async function* () {
      const response = responses[idx++] ?? "[mock-empty]";
      const entry = typeof response === "string" ? {text: response} : response;
      completion = {status: entry.status ?? "complete", finishReason: entry.finishReason ?? "stop"};
      yield entry.text;
      entry.abort?.abort();
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


const completeDocument = "## Complete document\n" + "Document content. ".repeat(400) + "\nREQUIRED FINAL SECTION";
const artifactResponses = ["Opening", "Argument", "Summary. ARTIFACT_NEEDED: yes", "Blueprint", completeDocument, "PASS", "APPROVED\nCONFIDENCE: 95\nRelease note", "Final verdict"];
const config = {...BASE_CONFIG, outputPreferenceMode: "document" as const};

beforeEach(() => vi.clearAllMocks());

it("releases the exact complete Builder source even when legacy Auditor output copies only part of it", async () => {
  const responses = [...artifactResponses];
  responses[6] = "APPROVED\nCONFIDENCE: 95\n## Complete document\nShort copy.";
  const provider = makeProvider(responses);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result = await runBrainSession({question:"Build the document",config,res:makeMockRes()});
  expect(result.artifacts).toBe(completeDocument);
  expect(result.courtroomOutcome.reason).toBe("approved");
  const reviewPrompt = JSON.stringify(provider.streamChat.mock.calls[6][0]);
  expect(reviewPrompt).toContain("Do not reproduce, shorten, or rewrite the artifact");
  expect(reviewPrompt).toContain("ARTIFACT RELEASE CONTRACT");
  expect(JSON.stringify(provider.streamChat.mock.calls[7][0])).toContain("document is delivered separately");
});

it.each([
  [0,"Orchestrator"], [1,"Advocate"], [2,"Moderator"], [3,"Architect"],
  [4,"Builder"], [5,"Architect"], [6,"Auditor"], [7,"Orchestrator"],
])("fails closed on token-limited stage %i (%s), retains usage, and never emits approved", async (index, role) => {
  const responses: Parameters<typeof makeProvider>[0] = [...artifactResponses];
  responses[index] = {text:artifactResponses[index] + " CUT-OFF",status:"truncated",finishReason:"length"};
  const provider = makeProvider(responses);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const res = makeMockRes();
  const result = await runBrainSession({question:"Build the document",config,res});
  expect(result).toMatchObject({confidence:0,pauseReason:"output_incomplete",outputIncomplete:{role,reason:"length"},courtroomOutcome:{reason:"output_incomplete"}});
  expect(provider.streamChat).toHaveBeenCalledTimes(index+1);
  expect(result.tokenUsage.calls).toHaveLength(index+1);
  expect(result.tokenUsage.outputTokens).toBe((index+1)*20);
  expect(result.artifacts).toBe(index >= 5 ? completeDocument : "");
  expect(result.transcript.at(-1)).toContain("CUT-OFF");
  expect(res._events.some(e => e.type === "provider_failover")).toBe(false);
  expect(res._events.some(e => (e.courtroomOutcome as any)?.reason === "approved")).toBe(false);
  expect(res._events.find(e => e.type === "done")).toMatchObject({pauseReason:"output_incomplete"});
});

it.each(["content_filter", "missing_completion_signal", "tool_calls"])("does not release an incomplete response (%s)", async reason => {
  const provider = makeProvider([{text:"APPROVED\nPartial", status:"incomplete", finishReason:reason}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result = await runBrainSession({question:"Q",config,res:makeMockRes(),deferCompletion:true});
  expect(result.outputIncomplete?.reason).toBe(reason);
  expect(result.courtroomOutcome.reason).toBe("output_incomplete");
  expect(provider.streamChat).toHaveBeenCalledTimes(1);
});

it("never approves a truncated no-artifact synthesis", async () => {
  const provider = makeProvider(["Open","Argument","ARTIFACT_NEEDED: no",{text:"APPROVED\nCONFIDENCE: 95\nCut off synthesis",status:"truncated",finishReason:"max_tokens"}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result = await runBrainSession({question:"Q",config:{...BASE_CONFIG,outputPreferenceMode:"answer-only"},res:makeMockRes()});
  expect(result.artifactPath).toBe("no-artifact");
  expect(result.artifacts).toBe("");
  expect(result.courtroomOutcome.reason).toBe("output_incomplete");
});

it("persists cancelled partial output and usage without approval or a second provider call", async () => {
  const abort = new AbortController();
  const provider = makeProvider(["Open", {text:"Partial independent reasoning",abort}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const res=makeMockRes();
  const result=await runBrainSession({question:"Q",config,res,abortSignal:abort.signal,deferCompletion:true});
  expect(result).toMatchObject({cancelled:true,confidence:0,courtroomOutcome:{reason:"aborted"}});
  expect(result.transcript.at(-1)).toContain("Partial independent reasoning");
  expect(result.turns.at(-1)?.content).toBe("Partial independent reasoning");
  expect(result.tokenUsage.calls).toHaveLength(2);
  expect(provider.streamChat).toHaveBeenCalledTimes(2);
  expect(res._events.find(e=>e.type==="done")).toBeUndefined();
});

it("retains the completed draft when cancellation interrupts review", async () => {
  const abort=new AbortController();
  const provider=makeProvider([...artifactResponses.slice(0,6),{text:"APPROVED\nIncomplete review",abort}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config,res:makeMockRes(),abortSignal:abort.signal});
  expect(result.cancelled).toBe(true);
  expect(result.artifacts).toBe(completeDocument);
  expect(result.courtroomOutcome.reason).toBe("aborted");
});

it("continues each independent seat's saved reasoning without leaking other seats or duplicating stored turns", async () => {
  const provider=makeProvider(["Advocate continued","Skeptic continued","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,litigantCount:2,maxIterations:2,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:[
    "**Orchestrator:** Open", "**Advocate (Round 1):** UNIQUE ADVOCATE REASONING", "**Skeptic (Round 1):** UNIQUE SKEPTIC REASONING",
  ],res:makeMockRes()});
  const firstPrompt=JSON.stringify(provider.streamChat.mock.calls[0][0]);
  const secondPrompt=JSON.stringify(provider.streamChat.mock.calls[1][0]);
  expect(firstPrompt).toContain("UNIQUE ADVOCATE REASONING");
  expect(firstPrompt).not.toContain("UNIQUE SKEPTIC REASONING");
  expect(firstPrompt).not.toContain("Begin your examination");
  expect(secondPrompt).toContain("UNIQUE SKEPTIC REASONING");
  expect(secondPrompt).not.toContain("UNIQUE ADVOCATE REASONING");
  expect(result.turns.filter(t=>t.round===1)).toHaveLength(0);
  expect(result.turns.filter(t=>t.round===2).map(t=>t.role)).toEqual(["Advocate","Skeptic"]);
});

it("resumes the remaining seat in a credit-paused round instead of charging to repeat completed seats", async () => {
  const provider=makeProvider(["Skeptic finishes","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,litigantCount:2,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:["**Advocate (Round 1):** Completed argument"],res:makeMockRes()});
  expect(JSON.stringify(provider.streamChat.mock.calls[0][0])).toContain("Your assigned role this session: Skeptic");
  expect(result.turns[0]).toMatchObject({role:"Skeptic",round:1});
  expect(provider.streamChat).toHaveBeenCalledTimes(4);
});

it("skips completed debate when a cap interrupted the Moderator", async () => {
  const provider=makeProvider(["ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  await runBrainSession({question:"Q",config:{...BASE_CONFIG,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:["**Advocate (Round 1):** Completed argument"],res:makeMockRes()});
  expect(JSON.stringify(provider.streamChat.mock.calls[0][0])).toContain("You are the moderator");
  expect(provider.streamChat).toHaveBeenCalledTimes(3);
});

it("numbers additional deliberation after a finished result monotonically", async () => {
  const provider=makeProvider(["New argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:["**Advocate (Round 1):** PRIOR ARGUMENT","**Moderator (Summary):** Old summary"],res:makeMockRes()});
  expect(result.turns[0]).toMatchObject({role:"Advocate",round:2});
  expect(JSON.stringify(provider.streamChat.mock.calls[0][0])).toContain("PRIOR ARGUMENT");
});

it("resumes an interrupted additional round without treating an old Moderator summary as fresh", async () => {
  const provider=makeProvider(["Skeptic round2","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,litigantCount:2,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:["**Advocate (Round 1):** A1","**Skeptic (Round 1):** S1","**Moderator (Summary):** Prior finished discussion","**Advocate (Round 2):** A2"],res:makeMockRes()});
  expect(result.turns[0]).toMatchObject({role:"Skeptic",round:2});
  expect(JSON.stringify(provider.streamChat.mock.calls[0][0])).toContain("S1");
  expect(provider.streamChat).toHaveBeenCalledTimes(4);
});

it("selects the latest saved Moderator summary for fixed-pipeline resume", async () => {
  const provider=makeProvider(["APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  await runBrainSession({question:"Q",config:{...BASE_CONFIG,outputPreferenceMode:"answer-only"},continueFromTranscript:["**Moderator (Summary):** OLD SUMMARY","**Moderator (Summary):** LATEST SUMMARY"],resumeWithFixedPipeline:true,res:makeMockRes()});
  expect(provider.streamChat.mock.calls[0][0][1].content).toMatch(/^Moderator's synthesised answer:\n\nLATEST SUMMARY/);
});

it.each([true,false])("surfaces exhausted review diagnosis through delivery, relay SSE, and saved result (diagnosis=%s)", async hasDiagnosis => {
  const question="Please supply CONTRACT_SIGNING_DATE_2026 to resolve the missing date.";
  const review="RETURNED\n## Revision Notes\nMissing signing date.";
  const provider=makeProvider(["Open","Argument","ARTIFACT_NEEDED: yes","Blueprint","Draft1","PASS",review,"Blueprint2","Draft2","PASS",review,"Blueprint3","Draft3","PASS",review+(hasDiagnosis?`\n## Convergence Diagnosis\n${question}`:""),"Unapproved draft; awaiting clarification"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const res=makeMockRes();
  const result=await runBrainSession({question:"Q",config,res});
  expect(result.courtroomOutcome.reason).toBe("convergence_failure");
  expect(result.convergenceFailure).toBe(true);
  expect(result.relayQuestion).toContain(hasDiagnosis?question:"Missing signing date");
  expect(JSON.stringify(provider.streamChat.mock.calls.at(-1)![0])).toContain(hasDiagnosis?question:"Missing signing date");
  expect(res._events.find(e=>e.type==="done")).toMatchObject({needsRelay:true,relayQuestion:result.relayQuestion});
});


it("retains an owned complete draft when continuation is cut off before a replacement exists", async () => {
  const provider=makeProvider([{text:"Partial review",status:"truncated",finishReason:"length"}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config:{...config,outputPreferenceMode:"answer-only"},continueFromTranscript:["**Moderator (Summary):** Previous summary"],continueFromArtifact:completeDocument,resumeWithFixedPipeline:true,res:makeMockRes()});
  expect(result.artifacts).toBe(completeDocument);
  expect(result.courtroomOutcome.reason).toBe("output_incomplete");
});

it("returns the completed corrected Builder source and its document caveats", async () => {
  const corrected="Corrected document.\n## Caveats\nVerify the source records before relying on this report.\n## Final section\nComplete.";
  const provider=makeProvider([...artifactResponses.slice(0,5),"REWORK\n## Correction Notes\nAdd missing caveats.",corrected,"APPROVED\nCONFIDENCE: 95\nReview passed","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config,res:makeMockRes()});
  expect(result.artifacts).toBe(corrected);
  expect(result.caveats).toContain("Verify the source records before relying on this report.");
});

it("never substitutes a cut-off Builder correction for the complete prior draft", async () => {
  const provider=makeProvider([...artifactResponses.slice(0,5),"REWORK\n## Correction Notes\nAdd missing caveats.",{text:"Cut off correction",status:"truncated",finishReason:"length"}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config,res:makeMockRes()});
  expect(result.artifacts).toBe(completeDocument);
  expect(result.courtroomOutcome.reason).toBe("output_incomplete");
  expect(provider.streamChat).toHaveBeenCalledTimes(7);
});

it("retains the missing-information question if final delivery is truncated", async () => {
  const question="What date was the contract signed?";
  const provider=makeProvider(["Open","Argument","ARTIFACT_NEEDED: no",`NOT_ENOUGH\n## Missing Information\n${question}`,{text:"The court needs",status:"truncated",finishReason:"length"}]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const result=await runBrainSession({question:"Q",config:{...BASE_CONFIG,outputPreferenceMode:"answer-only"},res:makeMockRes()});
  expect(result.relayQuestion).toBe(question);
  expect(result.courtroomOutcome.reason).toBe("output_incomplete");
});


it.each([" ", "\n"])("recovers all legacy own reasoning across Markdown separators (wrapper=%j)", async separator => {
  const provider=makeProvider(["Continued argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const saved=`**Advocate (Round 1):**${separator}BEFORE HORIZONTAL RULE\n\n---\n\nAFTER HORIZONTAL RULE\n\n---\n\n**Moderator (Summary):** Old summary`;
  await runBrainSession({question:"Q",config:{...BASE_CONFIG,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:saved.split("\n\n---\n\n"),res:makeMockRes()});
  const prompt=provider.streamChat.mock.calls[0][0][1].content;
  expect(prompt).toContain("BEFORE HORIZONTAL RULE\n\n---\n\nAFTER HORIZONTAL RULE");
  expect(prompt).not.toContain("Old summary");
});


it("preserves ordinary bold headings and following paragraphs in legacy own reasoning", async () => {
  const provider=makeProvider(["Continued argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const argument="BEFORE HORIZONTAL RULE\n\n---\n\n**Caveat:** This is part of the same argument.\n\n---\n\nIMPORTANT FINAL REASONING";
  const saved=`**Advocate (Round 1):** ${argument}\n\n---\n\n**Moderator (Summary):** Old summary`;
  await runBrainSession({question:"Q",config:{...BASE_CONFIG,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:saved.split("\n\n---\n\n"),res:makeMockRes()});
  const prompt=provider.streamChat.mock.calls[0][0][1].content;
  expect(prompt).toContain(argument);
  expect(prompt).not.toContain("Old summary");
});


it("does not merge a saved inactive seat into an active seat's independent history after a role-cap reduction", async () => {
  const provider=makeProvider(["Continued argument","ARTIFACT_NEEDED: no","APPROVED\nCONFIDENCE: 95\nAnswer","Verdict"]);
  vi.mocked(createProviderAsync).mockResolvedValue(provider as any);
  const saved="**Advocate (Round 1):** ACTIVE SEAT REASONING\n\n---\n\n**Skeptic (Round 1):** INACTIVE SEAT REASONING\n\n---\n\nINACTIVE SEAT CONTINUATION\n\n---\n\n**Moderator (Summary):** Old summary";
  await runBrainSession({question:"Q",config:{...BASE_CONFIG,litigantCount:1,aiReasoning:"independent",outputPreferenceMode:"answer-only"},continueFromTranscript:saved.split("\n\n---\n\n"),res:makeMockRes()});
  const prompt=provider.streamChat.mock.calls[0][0][1].content;
  expect(prompt).toContain("ACTIVE SEAT REASONING");
  expect(prompt).not.toContain("INACTIVE SEAT REASONING");
  expect(prompt).not.toContain("INACTIVE SEAT CONTINUATION");
  expect(prompt).not.toContain("Old summary");
});
