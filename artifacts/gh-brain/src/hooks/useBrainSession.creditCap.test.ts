import { CourtConfigSchema } from "@workspace/api-zod/session";
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

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Module mocks (must be hoisted before any import) ───────────────────────

vi.mock("react", () => ({
  useEffect: vi.fn(),
  useReducer: vi.fn(),
  useRef: vi.fn(),
  useCallback: vi.fn(),
}));

vi.mock("@/services/sessionService", () => ({
  runBrainSession: vi.fn(),
  updateSession: vi.fn(),
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
  useBrainSession,
  _reducerForTests as reducer,
  _makeInitialStateForTests as makeInitialState,
  type SessionState,
} from "./useBrainSession";

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitialState(): SessionState {
  return makeInitialState();
}

// Exercise the same complete saved-session payload used by the page.
function buildPrefillPausedAction(opts: {
  question: string; sessionId: string; confidence: number; creditsUsed: number;
  finalAnswer: string; debateNotes: string; transcript: string; caveats: string; artifacts: string;
}) {
  return {
    type: "RESTORE_SESSION" as const,
    session: { ...opts, id: opts.sessionId, title: opts.question, templateId: null,
      status: "paused_credit_cap" as const, createdAt: "", updatedAt: "" },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("credit-cap partial answer survival", () => {
  describe("RESTORE_SESSION reducer case", () => {
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


// The async acceptance action must wait for the persisted status, while retaining
// the paused result on errors and ignoring a response after the user resets.
import { useReducer, useRef, useCallback, useEffect } from "react";
import { updateSession, runBrainSession, type SavedSession } from "@/services/sessionService";
import { useAuth } from "@/contexts/AuthContext";

describe("persisted answer acceptance", () => {
  let current: SessionState;
  beforeEach(() => {
    vi.clearAllMocks();
    current = { ...makeInitialState(), phase: "paused", sessionId: "saved",
      pauseReason: "credit_cap", finalAnswer: "Partial answer", creditsUsed: 40 };
    vi.mocked(useReducer).mockReturnValue([current, (action: any) => { current = reducer(current, action); }] as any);
    vi.mocked(useRef).mockImplementation((value: any) => ({ current: value }));
    vi.mocked(useCallback).mockImplementation((callback: any) => callback);
    vi.mocked(useAuth).mockReturnValue({ user: { getIdToken: async () => "test-token" } } as any);
  });

  it("waits for the server and coalesces repeated taps", async () => {
    let finish!: (value: any) => void;
    vi.mocked(updateSession).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const hook = useBrainSession();
    const pending = hook.acceptPartial();
    await hook.acceptPartial();
    expect(current.phase).toBe("paused");
    expect(current.acceptingAnswer).toBe(true);
    expect(updateSession).toHaveBeenCalledTimes(1);
    expect(updateSession).toHaveBeenCalledWith("saved", { status: "complete" }, "test-token");
    finish({ success: true, status: "complete" });
    await pending;
    expect(current).toMatchObject({ phase: "complete", acceptingAnswer: false,
      pauseReason: null, finalAnswer: "Partial answer", creditsUsed: 40 });
  });

  it("keeps the answer paused and allows retry after a save failure", async () => {
    vi.mocked(updateSession).mockRejectedValueOnce(new Error("Could not save"));
    const hook = useBrainSession();
    await hook.acceptPartial();
    expect(current).toMatchObject({ phase: "paused", acceptingAnswer: false,
      acceptanceError: "Could not save", finalAnswer: "Partial answer" });
    vi.mocked(updateSession).mockResolvedValue({ success: true, status: "complete" });
    await hook.acceptPartial();
    expect(current.phase).toBe("complete");
    expect(current.acceptanceError).toBeNull();
  });

  it("does not treat an unconfirmed response as completion", async () => {
    vi.mocked(updateSession).mockResolvedValue({ success: true });
    await useBrainSession().acceptPartial();
    expect(current.phase).toBe("paused");
    expect(current.acceptanceError).toContain("not confirmed");
  });

  it("does not overwrite a new session when an earlier acceptance finishes", async () => {
    let finish!: (value: any) => void;
    vi.mocked(updateSession).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const hook = useBrainSession();
    const pending = hook.acceptPartial();
    hook.reset();
    finish({ success: true, status: "complete" });
    await pending;
    expect(current.phase).toBe("idle");
    expect(current.sessionId).toBeNull();
  });

  it("does not claim guest answers were saved", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    await useBrainSession().acceptPartial();
    expect(current.phase).toBe("paused");
    expect(current.acceptanceError).toContain("Sign in");
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe("server completion status", () => {
  it.each([
    ["complete", "complete"], ["incomplete", "paused"],
    ["paused_credit_cap", "paused"], ["relay_needed", "relay_needed"], ["error", "error"],
  ] as const)("renders %s as %s", (status, phase) => {
    const state = reducer(makeInitialState(), { type: "SESSION_DONE", payload: {
      status, sessionId: "saved", confidence: 90, creditsUsed: 40,
      finalAnswer: "Answer", debateNotes: "", transcript: "", caveats: "", artifacts: "",
    } });
    expect(state.phase).toBe(phase);
    if (phase === "paused") expect(state.pauseReason).toBeTruthy();
  });
});


describe("full saved session restoration", () => {
  const attachment = { id: "evidence", type: "file" as const, name: "evidence.txt", content: "Original evidence" };
  const template = { id: "business-plan", title: "Business Plan", defaultConfig: { confidenceTarget: 80 } } as any;
  const saved: SavedSession = {
    id: "saved-parent", title: "Saved", question: "Saved question", status: "complete", templateId: template.id, template,
    createdAt: "", updatedAt: "", confidence: 85, creditsUsed: 40,
    config: { litigantCount: 4, maxCredits: 700 } as any,
    finalAnswer: "Saved answer", transcript: "Original transcript", debateNotes: "Notes", artifacts: "Built document",
    caveats: "Review this", caseFile: [attachment], artifactPath: "artifact",
    courtroomOutcome: { reason: "approved", confidenceAtExit: 85, round: 2 },
    relayCount: 2, relayQuestion: "Missing fact?", rebuttalRound: 3,
  };
  it.each(["complete", "incomplete", "paused_credit_cap", "relay_needed"] as const)("restores all persisted context for %s", status => {
    const dirty = { ...makeInitialState(), caseFile: [{ ...attachment, id: "wrong" }], config: { ...makeInitialState().config, maxCredits: 9999 } };
    const restored = reducer(dirty, { type: "RESTORE_SESSION", session: { ...saved, status } });
    expect(restored).toMatchObject({ question: saved.question, template, caseFile: [attachment],
      finalAnswer: saved.finalAnswer, transcript: saved.transcript, debateNotes: saved.debateNotes,
      caveats: saved.caveats, artifacts: saved.artifacts, artifactPath: "artifact",
      courtroomOutcome: saved.courtroomOutcome, relayCount: 2, rebuttalRound: 3,
      config: { litigantCount: 4, maxCredits: 700 }, pauseTranscript: [saved.transcript] });
    expect(restored.needsRelay).toBe(status === "relay_needed");
  });

  it.each(["continueSession", "submitRebuttal", "submitRelay"] as const)("carries restored attachments and template into %s", async method => {
    vi.clearAllMocks();
    const restored = reducer(makeInitialState(), { type: "RESTORE_SESSION", session: { ...saved, status: "incomplete" } });
    vi.mocked(useReducer).mockReturnValue([restored, vi.fn()] as any);
    vi.mocked(useRef).mockImplementation((value: any) => ({ current: value }));
    vi.mocked(useCallback).mockImplementation((callback: any) => callback);
    vi.mocked(useAuth).mockReturnValue({ user: { getIdToken: async () => "test-token" } } as any);
    vi.mocked(runBrainSession).mockResolvedValue();
    const hook = useBrainSession();
    if (method === "continueSession") await hook.continueSession();
    else await hook[method]("New information");
    const request = vi.mocked(runBrainSession).mock.calls[0][0];
    expect(request).toMatchObject({ question: saved.question, templateId: template.id, caseFile: [attachment], config: { maxCredits: 700 } });
    if (method === "submitRebuttal") expect(request.rebuttalContext).toMatchObject({ parentSessionId: saved.id, originalVerdict: saved.finalAnswer, rebuttalRound: 4 });
    if (method === "submitRelay") expect(request.relayContext).toMatchObject({ parentSessionId: saved.id, originalTranscript: [saved.transcript], relayRound: 3 });
  });

  it("does not leak the previously opened session's template, evidence or configuration into a sparse record", () => {
    const prior = reducer(makeInitialState(), { type: "RESTORE_SESSION", session: saved });
    const restored = reducer(prior, { type: "RESTORE_SESSION", session: {
      id: "older", title: "Older", question: "Older question", status: "complete", templateId: null,
      confidence: 0, creditsUsed: 0, createdAt: "", updatedAt: "",
    } });
    expect(restored.caseFile).toEqual([]);
    expect(restored.template).toBeNull();
    expect(restored.courtroomOutcome).toBeNull();
    expect(restored.config).toEqual(makeInitialState().config);
  });
});


describe("saved preferences arriving after the session page opens", () => {
  const preferences = { litigantCount: 5, confidenceTarget: 91, maxCredits: 800,
    responseMode: "thorough" as const, outputFormat: "report" as const };

  it("applies late preferences without losing the question or evidence already entered", () => {
    const evidence = { id: "evidence", type: "file" as const, name: "notes.txt", content: "Notes" };
    let state = reducer(makeInitialState(), { type: "SET_QUESTION", question: "My question" });
    state = reducer(state, { type: "ADD_CASE_FILE", item: evidence });
    state = reducer(state, { type: "LOAD_DEFAULTS", config: preferences });
    expect(state.config).toMatchObject(preferences);
    expect(state.question).toBe("My question");
    expect(state.caseFile).toEqual([evidence]);
    expect(state.canLoadDefaults).toBe(false);
  });

  it.each(["configuration", "seat", "template"])("preserves a user's %s choice made before preferences arrive", choice => {
    const initial = makeInitialState();
    const edited = choice === "configuration" ? reducer(initial, { type: "SET_CONFIG", config: { maxCredits: 123 } })
      : choice === "seat" ? reducer(initial, { type: "SET_SEAT_AI", seatId: "auditor", assignment: { provider: "anthropic", model: "chosen-model" } })
      : reducer(initial, { type: "SET_TEMPLATE", template: { id: "chosen", defaultConfig: { ...initial.config, confidenceTarget: 75 } } as any });
    expect(reducer(edited, { type: "LOAD_DEFAULTS", config: preferences })).toBe(edited);
  });

  it("does not replace preferences already applied during initial render", () => {
    const state = makeInitialState(preferences);
    expect(reducer(state, { type: "LOAD_DEFAULTS", config: { maxCredits: 999 } })).toBe(state);
  });

  it("does not change a run that starts before the profile arrives", () => {
    const running = reducer(makeInitialState(), { type: "SET_PHASE", phase: "running" });
    expect(reducer(running, { type: "LOAD_DEFAULTS", config: preferences })).toBe(running);
  });

  it.each([true, false])("never overrides a restored session (stored config: %s)", hasConfig => {
    const restored = reducer(makeInitialState(), { type: "RESTORE_SESSION", session: {
      id: "saved", title: "Saved", question: "Saved question", templateId: null,
      status: "incomplete", confidence: 70, creditsUsed: 40, createdAt: "", updatedAt: "",
      ...(hasConfig ? { config: { maxCredits: 150, litigantCount: 2 } as any } : {}),
    } });
    expect(reducer(restored, { type: "LOAD_DEFAULTS", config: preferences })).toBe(restored);
  });

  it("resets to the latest saved preferences and can await a profile when none has loaded", () => {
    const edited = reducer(makeInitialState(), { type: "SET_CONFIG", config: { maxCredits: 12 } });
    const fresh = reducer(edited, { type: "RESET", config: preferences });
    expect(fresh.config).toMatchObject(preferences);
    expect(fresh.phase).toBe("idle");
    expect(fresh.canLoadDefaults).toBe(false);
    const waiting = reducer(edited, { type: "RESET" });
    expect(waiting.canLoadDefaults).toBe(true);
    expect(reducer(waiting, { type: "LOAD_DEFAULTS", config: preferences }).config).toMatchObject(preferences);
  });

  it("the hook loads delayed preferences once and its stable reset uses the latest profile", () => {
    vi.clearAllMocks();
    let current = makeInitialState();
    const dispatch = (action: any) => { current = reducer(current, action); };
    const refs: Array<{ current: any }> = [];
    let refIndex = 0;
    vi.mocked(useReducer).mockImplementation(() => [current, dispatch] as any);
    vi.mocked(useRef).mockImplementation((value: any) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }));
    vi.mocked(useCallback).mockImplementation((callback: any) => callback);
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    vi.mocked(useEffect).mockImplementation(effect => { effect(); });
    const render = (config?: any) => { refIndex = 0; return useBrainSession(config); };
    try {
      const original = render();
      original.setQuestion("Keep my draft");
      render(preferences);
      expect(current.config).toMatchObject(preferences);
      expect(current.question).toBe("Keep my draft");
      render({ ...preferences, maxCredits: 900 });
      expect(current.config.maxCredits).toBe(800);
      // Use the callback from before the profile arrived, as React's useCallback does.
      original.reset();
      expect(current.config.maxCredits).toBe(900);
      expect(current.question).toBe("");
    } finally { vi.mocked(useEffect).mockReset(); }
  });
});


describe("complete configuration persistence", () => {
  it("restores every configured setting from saved JSON instead of today’s defaults", () => {
    const seat={provider:"auto",intelligenceLevel:73,useMasterSettings:false};
    const config=CourtConfigSchema.parse({litigantCount:2,confidenceTarget:85,maxIterations:20,responseMode:"thorough",
      outputFormat:"bullets",conscience:false,aiReasoning:"chain",maxCredits:2500,debateMode:"collaborative",
      artifactType:"legal-brief",outputStrategy:"consensus+individual",format:"docx",intelligenceLevel:62,outputPreferenceMode:"document",
      seatMap:{orchestrator:seat,moderator:seat,architect:seat,builder:seat,auditor:seat,litigants:[seat,seat]}});
    expect(makeInitialState(JSON.parse(JSON.stringify(config))).config).toEqual(config);
    const saved={id:"saved-output",status:"complete",question:"Saved",config:JSON.parse(JSON.stringify(config)),
      finalAnswer:"Consensus",debateNotes:"Arguments",transcript:"All turns",artifacts:"Brief"} as any;
    const restored=reducer(makeInitialState(),{type:"RESTORE_SESSION",session:saved});
    expect(restored.config).toEqual(config);
    expect(reducer(restored,{type:"LOAD_DEFAULTS",config:{outputStrategy:"individual",format:"pdf"}}).config).toEqual(config);
  });
});
