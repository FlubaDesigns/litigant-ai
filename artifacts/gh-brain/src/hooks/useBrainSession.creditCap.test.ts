/**
 * Unit tests: credit-cap partial answer survival
 *
 * Verifies that a paused_credit_cap session loaded from History is correctly
 * restored — including finalAnswer, pauseReason, pauseTranscript and the
 * "paused" phase — so the user can continue after a server restart.
 *
 * Tests the pure reducer (_reducerForTests) and makeInitialState directly,
 * avoiding the need for DOM / Firebase / SSE.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Module mocks (must be hoisted before any import) ───────────────────────

vi.mock("react", () => ({
  useReducer: vi.fn(),
  useRef: vi.fn(),
  useCallback: vi.fn(),
}));

vi.mock("@/services/sessionService", () => ({
  runBrainSession: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock("@/services/providerService", () => ({
  getProviders: vi.fn(),
  resolveModelByIntelligence: vi.fn(),
}));

// Minimal seat/config stubs so makeInitialState can run
vi.mock("@/data/seatTypes", () => ({
  makeDefaultSeatMap: vi.fn(() => ({
    orchestrator: { provider: "openai", model: "gpt-4o" },
    moderator: { provider: "openai", model: "gpt-4o" },
    auditor: { provider: "openai", model: "gpt-4o" },
    architect: { provider: "openai", model: "gpt-4o" },
    builder: { provider: "openai", model: "gpt-4o" },
    litigants: [],
  })),
  makeDefaultGrades: vi.fn(() => ({})),
  syncLitigantSeats: vi.fn((seats: unknown[]) => seats),
  gradeToIndex: vi.fn(() => 0),
  indexToGrade: vi.fn(() => "B+"),
}));

vi.mock("@/data/templates", () => ({
  DEFAULT_CONFIG: {
    litigantCount: 3,
    confidenceTarget: 80,
    maxIterations: 2,
    responseMode: "balanced",
    outputFormat: "report",
  },
  TEMPLATES: [],
}));

// ── Import under test ──────────────────────────────────────────────────────

import {
  _reducerForTests as reducer,
  _makeInitialStateForTests as makeInitialState,
  type SessionState,
} from "./useBrainSession";

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitialState(): SessionState {
  return makeInitialState();
}

// Build a PREFILL_PAUSED action the same way loadPausedSession + Session.tsx would
function buildPrefillPausedAction(opts: {
  question: string;
  sessionId: string;
  confidence: number;
  creditsUsed: number;
  finalAnswer: string;
  debateNotes: string;
  transcript: string;
  caveats: string;
  artifacts: string;
}) {
  const pauseTranscript = opts.transcript
    ? opts.transcript.split("\n\n---\n\n").filter(Boolean)
    : [];
  return {
    type: "PREFILL_PAUSED" as const,
    question: opts.question,
    config: {},
    sessionId: opts.sessionId,
    confidence: opts.confidence,
    creditsUsed: opts.creditsUsed,
    finalAnswer: opts.finalAnswer,
    debateNotes: opts.debateNotes,
    transcript: opts.transcript,
    caveats: opts.caveats,
    artifacts: opts.artifacts,
    pauseTranscript,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("credit-cap partial answer survival", () => {
  describe("PREFILL_PAUSED reducer case", () => {
    it("sets phase to 'paused'", () => {
      const action = buildPrefillPausedAction({
        question: "What is the best approach?",
        sessionId: "sess-abc-123",
        confidence: 72,
        creditsUsed: 340,
        finalAnswer: "Based on partial analysis, Option A is preferable.",
        debateNotes: "Litigant 1 favoured A; Litigant 2 favoured B.",
        transcript: "**Litigant 1 (Round 1):**\nOption A is best.\n\n---\n\n**Litigant 2 (Round 1):**\nOption B is best.",
        caveats: "Analysis was cut short due to credit cap.",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.phase).toBe("paused");
    });

    it("restores finalAnswer from the session doc", () => {
      const finalAnswer = "Based on partial analysis, Option A is preferable.";
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc-123",
        confidence: 72,
        creditsUsed: 340,
        finalAnswer,
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.finalAnswer).toBe(finalAnswer);
    });

    it("sets pauseReason to 'credit_cap'", () => {
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc-123",
        confidence: 72,
        creditsUsed: 340,
        finalAnswer: "Partial answer here.",
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.pauseReason).toBe("credit_cap");
    });

    it("restores sessionId", () => {
      const sessionId = "sess-unique-id-999";
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId,
        confidence: 55,
        creditsUsed: 200,
        finalAnswer: "Partial.",
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.sessionId).toBe(sessionId);
    });

    it("restores confidence and creditsUsed", () => {
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc",
        confidence: 67,
        creditsUsed: 450,
        finalAnswer: "Partial.",
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.confidence).toBe(67);
      expect(state.creditsUsed).toBe(450);
    });

    it("sets courtHappened to true", () => {
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc",
        confidence: 67,
        creditsUsed: 450,
        finalAnswer: "Partial.",
        debateNotes: "Some notes.",
        transcript: "**L1:**\nA.\n\n---\n\n**L2:**\nB.",
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.courtHappened).toBe(true);
    });
  });

  describe("pauseTranscript reconstruction from transcript string", () => {
    it("splits transcript on \\n\\n---\\n\\n separator", () => {
      const transcript = [
        "**Litigant 1 (Round 1):**\nOption A is best.",
        "**Litigant 2 (Round 1):**\nOption B is best.",
        "**Moderator:**\nHearing both arguments.",
      ].join("\n\n---\n\n");

      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc",
        confidence: 60,
        creditsUsed: 300,
        finalAnswer: "Partial.",
        debateNotes: "",
        transcript,
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);

      expect(state.pauseTranscript).toHaveLength(3);
      expect(state.pauseTranscript![0]).toContain("Litigant 1");
      expect(state.pauseTranscript![1]).toContain("Litigant 2");
      expect(state.pauseTranscript![2]).toContain("Moderator");
    });

    it("produces an empty pauseTranscript when transcript is empty string", () => {
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc",
        confidence: 60,
        creditsUsed: 300,
        finalAnswer: "Partial.",
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.pauseTranscript).toEqual([]);
    });

    it("handles a single-segment transcript (no separator) as a single-item array", () => {
      const transcript = "**Litigant 1 (Round 1):**\nOnly one contribution.";
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc",
        confidence: 60,
        creditsUsed: 300,
        finalAnswer: "Partial.",
        debateNotes: "",
        transcript,
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      expect(state.pauseTranscript).toHaveLength(1);
      expect(state.pauseTranscript![0]).toBe(transcript);
    });

    it("filters out empty strings from split result", () => {
      // Leading separator would produce an empty first element without filter
      const transcript = "\n\n---\n\n**L1:**\nContent.\n\n---\n\n**L2:**\nMore content.";
      const action = buildPrefillPausedAction({
        question: "Best approach?",
        sessionId: "sess-abc",
        confidence: 60,
        creditsUsed: 300,
        finalAnswer: "Partial.",
        debateNotes: "",
        transcript,
        caveats: "",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);
      // All elements should be non-empty
      expect(state.pauseTranscript!.every((s) => s.length > 0)).toBe(true);
    });
  });

  describe("continueSession request building from paused state", () => {
    it("continueSession uses the restored sessionId and pauseTranscript", () => {
      // Simulate what continueSession does: build the BrainRunRequest from restored state
      const transcript = [
        "**Litigant 1:**\nOption A.",
        "**Litigant 2:**\nOption B.",
      ].join("\n\n---\n\n");

      const action = buildPrefillPausedAction({
        question: "What is best?",
        sessionId: "sess-resume-me",
        confidence: 70,
        creditsUsed: 380,
        finalAnswer: "Partial moderator answer here.",
        debateNotes: "Notes from debate.",
        transcript,
        caveats: "Caveats here.",
        artifacts: "",
      });
      const state = reducer(getInitialState(), action);

      // The request that continueSessionFn would build:
      const isCreditCapPause = state.pauseReason === "credit_cap";
      const resumeRequest = {
        question: state.question,
        sessionId: state.sessionId ?? undefined,
        continueFromTranscript: state.pauseTranscript,
        ...(isCreditCapPause ? { resumeWithFixedPipeline: true } : {}),
      };

      expect(resumeRequest.sessionId).toBe("sess-resume-me");
      expect(resumeRequest.resumeWithFixedPipeline).toBe(true);
      expect(resumeRequest.continueFromTranscript).toHaveLength(2);
      expect(resumeRequest.continueFromTranscript![0]).toContain("Litigant 1");
    });
  });
});
