import { useReducer, useRef, useCallback } from "react";
import { runBrainSession, type SSEEvent, type BrainRunRequest, type PauseReason, type RebuttalContext } from "@/services/sessionService";
import type { Template, CourtConfig } from "@/data/templates";
import { DEFAULT_CONFIG } from "@/data/templates";
import {
  makeDefaultSeatMap,
  makeDefaultGrades,
  syncLitigantSeats,
  gradeToIndex,
  indexToGrade,
  type GradeMap,
  type SeatAssignment,
  type SeatMapConfig,
} from "@/data/seatTypes";
import { useAuth } from "@/contexts/AuthContext";

export type SessionPhase =
  | "idle"
  | "configuring"
  | "running"
  | "paused"
  | "complete"
  | "error";

export interface FeedItem {
  id: string;
  role: string;
  provider: string;
  content: string;
  round: number;
  timestamp: number;
  isComplete: boolean;
}

export interface RebuttalRecord {
  round: number;
  challenge: string;
  sessionId: string;
  finalAnswer: string;
}

export interface SessionState {
  phase: SessionPhase;
  question: string;
  template: Template | null;
  config: CourtConfig;
  sessionId: string | null;
  runtimeFeed: FeedItem[];
  activityLog: string[];
  courtHappened: boolean;
  activeRole: string | null;
  /** Current attempt number for Builder/Auditor (1 = initial pass, 2+ = retry). */
  activeAttempt: number;
  confidence: number;
  creditsUsed: number;
  estimatedCredits: number;
  currentRound: number;
  finalAnswer: string;
  debateNotes: string;
  transcript: string;
  caveats: string;
  artifacts: string;
  errorMessage: string | null;
  pauseReason: PauseReason | null;
  pauseTranscript: string[] | null;
  grades: GradeMap;
  /** Completed rebuttal rounds — each entry is a prior challenge + the verdict it produced. */
  rebuttals: RebuttalRecord[];
  /** Which rebuttal round we are on (0 = original trial, 1 = first rebuttal, etc.). */
  rebuttalRound: number;
}

type Action =
  | { type: "SET_QUESTION"; question: string }
  | { type: "SET_TEMPLATE"; template: Template | null }
  | { type: "SET_CONFIG"; config: Partial<CourtConfig> }
  | { type: "SET_SEAT_AI"; seatId: string; litIndex?: number; assignment: SeatAssignment }
  | { type: "APPLY_FEEDBACK_GRADES"; thumbs: "good" | "bad"; flow: "answer" | "build" }
  | { type: "SET_PHASE"; phase: SessionPhase }
  | { type: "SESSION_STARTED"; sessionId: string; estimatedCredits: number }
  | { type: "ROLE_START"; role: string; round: number; roleIndex: number; provider: string; attempt?: number }
  | { type: "CONTENT_CHUNK"; role: string; content: string }
  | { type: "ROLE_END"; role: string }
  | { type: "ROUND_START"; round: number; confidence: number }
  | { type: "CONFIDENCE_UPDATE"; confidence: number; creditsUsed: number }
  | {
      type: "SESSION_DONE";
      payload: {
        confidence: number;
        creditsUsed: number;
        finalAnswer: string;
        debateNotes: string;
        transcript: string;
        caveats: string;
        artifacts: string;
        sessionId: string;
        pauseReason?: PauseReason;
        pauseTranscript?: string[];
      };
    }
  | { type: "ERROR"; message: string }
  | { type: "RESET" }
  | { type: "REBUTTAL_SUBMIT"; newRound: number; challenge: string; prevSessionId: string; prevFinalAnswer: string }
  | {
      type: "PREFILL_PAUSED";
      question: string;
      config: Partial<CourtConfig>;
      sessionId: string;
      confidence: number;
      creditsUsed: number;
      finalAnswer: string;
      debateNotes: string;
      transcript: string;
      caveats: string;
      artifacts: string;
      pauseTranscript: string[];
    };

function makeInitialState(initialConfig?: Partial<CourtConfig>): SessionState {
  const litigantCount = initialConfig?.litigantCount ?? DEFAULT_CONFIG.litigantCount;
  const config: CourtConfig = {
    ...DEFAULT_CONFIG,
    ...initialConfig,
    seatMap: initialConfig?.seatMap ?? makeDefaultSeatMap(litigantCount),
  };
  return {
    phase: "idle",
    rebuttals: [],
    rebuttalRound: 0,
    question: "",
    template: null,
    config,
    sessionId: null,
    runtimeFeed: [],
    activityLog: [],
    courtHappened: false,
    activeRole: null,
    activeAttempt: 1,
    confidence: 0,
    creditsUsed: 0,
    estimatedCredits: 0,
    currentRound: 0,
    finalAnswer: "",
    debateNotes: "",
    transcript: "",
    caveats: "",
    artifacts: "",
    errorMessage: null,
    pauseReason: null,
    pauseTranscript: null,
    grades: makeDefaultGrades(),
  };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "SET_QUESTION":
      return { ...state, question: action.question };

    case "SET_TEMPLATE":
      return {
        ...state,
        template: action.template,
        config: action.template
          ? {
              ...action.template.defaultConfig,
              seatMap: state.config.seatMap ?? makeDefaultSeatMap(action.template.defaultConfig.litigantCount),
            }
          : state.config,
      };

    case "SET_CONFIG": {
      const newConfig = { ...state.config, ...action.config };
      // Sync seatMap litigant seats when litigantCount changes
      if (action.config.litigantCount !== undefined && newConfig.seatMap) {
        newConfig.seatMap = {
          ...newConfig.seatMap,
          litigants: syncLitigantSeats(newConfig.seatMap.litigants, newConfig.litigantCount),
        };
      }
      return { ...state, config: newConfig };
    }

    case "SET_SEAT_AI": {
      const { seatId, litIndex, assignment } = action;
      const seatMap: SeatMapConfig = state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount);
      let updated: SeatMapConfig;
      if (seatId === "litigant" && litIndex !== undefined) {
        const litigants = [...seatMap.litigants];
        litigants[litIndex] = assignment;
        updated = { ...seatMap, litigants };
      } else {
        updated = { ...seatMap, [seatId]: assignment };
      }
      return { ...state, config: { ...state.config, seatMap: updated } };
    }

    case "APPLY_FEEDBACK_GRADES": {
      const { thumbs, flow } = action;
      const delta = thumbs === "good" ? 1 : -1;
      const seatsToScore = flow === "build"
        ? ["orchestrator", "moderator", "architect", "builder", "auditor"]
        : ["orchestrator", "moderator"];

      const grades = { ...state.grades };
      for (const seatId of seatsToScore) {
        const current = grades[seatId] ?? { grade: "B+", runs: 0, good: 0, bad: 0 };
        grades[seatId] = {
          grade: indexToGrade(gradeToIndex(current.grade) + delta),
          runs: current.runs + 1,
          good: current.good + (thumbs === "good" ? 1 : 0),
          bad: current.bad + (thumbs === "bad" ? 1 : 0),
        };
      }
      return { ...state, grades };
    }

    case "SET_PHASE":
      return { ...state, phase: action.phase };

    case "SESSION_STARTED":
      return {
        ...state,
        phase: "running",
        sessionId: action.sessionId,
        estimatedCredits: action.estimatedCredits,
        runtimeFeed: [],
        activityLog: ["[System] Session started — courtroom assembling…"],
        courtHappened: false,
        confidence: 0,
        creditsUsed: 0,
        currentRound: 0,
        finalAnswer: "",
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
        errorMessage: null,
      };

    case "ROLE_START": {
      const { role, round, roleIndex, provider, attempt } = action;
      const isLitigant = roleIndex >= 0 && roleIndex !== 99;
      const isVerdict = roleIndex === 99 || role === "Verdict";
      let logEntry = "";
      let nextCourtHappened = state.courtHappened;
      if (isVerdict) {
        logEntry = `[Orchestrator] formulating final answer…`;
      } else if (isLitigant) {
        nextCourtHappened = true;
        const providerLabel = provider ? ` / ${provider}` : "";
        logEntry = `[Litigant ${roleIndex + 1}${providerLabel}] reasoning…`;
      } else if (role === "Orchestrator") {
        logEntry = `[Orchestrator] routing…`;
      } else if (role === "Moderator") {
        logEntry = state.courtHappened ? `[Moderator] synthesizing…` : `[Moderator] framing…`;
      } else if (role === "Builder") {
        logEntry = attempt && attempt > 1 ? `[Builder] revising artifact (pass ${attempt})…` : `[Builder] constructing artifact…`;
      } else if (role === "Auditor") {
        logEntry = attempt && attempt > 1 ? `[Auditor] re-reviewing (pass ${attempt})…` : `[Auditor] reviewing artifact…`;
      } else {
        logEntry = `[${role}] working…`;
      }
      return {
        ...state,
        activeRole: role,
        activeAttempt: attempt ?? 1,
        currentRound: round > 0 ? round : state.currentRound,
        courtHappened: nextCourtHappened,
        activityLog: [...state.activityLog, logEntry],
        runtimeFeed: [
          ...state.runtimeFeed,
          {
            id: `${role}-${round}-${Date.now()}`,
            role,
            provider: provider ?? "",
            content: "",
            round,
            timestamp: Date.now(),
            isComplete: false,
          },
        ],
      };
    }

    case "CONTENT_CHUNK": {
      const feed = [...state.runtimeFeed];
      const lastIdx = feed.findLastIndex((f) => f.role === action.role && !f.isComplete);
      if (lastIdx !== -1) {
        feed[lastIdx] = { ...feed[lastIdx], content: feed[lastIdx].content + action.content };
      }
      return { ...state, runtimeFeed: feed };
    }

    case "ROLE_END": {
      const feed = state.runtimeFeed.map((f) =>
        f.role === action.role && !f.isComplete ? { ...f, isComplete: true } : f
      );
      return { ...state, runtimeFeed: feed, activeRole: null };
    }

    case "ROUND_START": {
      const logEntry = `[Courtroom] Round ${action.round} — confidence at ${action.confidence}%`;
      return { ...state, currentRound: action.round, activityLog: [...state.activityLog, logEntry] };
    }

    case "CONFIDENCE_UPDATE": {
      const logEntry = `[Courtroom] Round complete — confidence now ${action.confidence}%`;
      return {
        ...state,
        confidence: action.confidence,
        creditsUsed: action.creditsUsed,
        activityLog: [...state.activityLog, logEntry],
      };
    }

    case "SESSION_DONE":
      return {
        ...state,
        phase: action.payload.pauseReason ? "paused" : "complete",
        activeRole: null,
        confidence: action.payload.confidence,
        creditsUsed: action.payload.creditsUsed,
        finalAnswer: action.payload.finalAnswer,
        debateNotes: action.payload.debateNotes,
        transcript: action.payload.transcript,
        caveats: action.payload.caveats,
        artifacts: action.payload.artifacts,
        sessionId: action.payload.sessionId,
        pauseReason: action.payload.pauseReason ?? null,
        pauseTranscript: action.payload.pauseTranscript ?? null,
        activityLog: [...state.activityLog, `[Orchestrator] final delivery — ${action.payload.confidence}% confidence`],
      };

    case "ERROR":
      return { ...state, phase: "error", activeRole: null, errorMessage: action.message };

    case "REBUTTAL_SUBMIT":
      return {
        ...state,
        phase: "running",
        rebuttals: [
          ...state.rebuttals,
          {
            round: state.rebuttalRound,
            challenge: action.challenge,
            sessionId: action.prevSessionId,
            finalAnswer: action.prevFinalAnswer,
          },
        ],
        rebuttalRound: action.newRound,
        runtimeFeed: [],
        activityLog: [`[System] Rebuttal Round ${action.newRound} — court reconvening on your challenge…`],
        courtHappened: false,
        confidence: 0,
        creditsUsed: 0,
        currentRound: 0,
        finalAnswer: "",
        debateNotes: "",
        transcript: "",
        caveats: "",
        artifacts: "",
        errorMessage: null,
        pauseReason: null,
        pauseTranscript: null,
      };

    case "RESET":
      return makeInitialState();

    case "PREFILL_PAUSED": {
      const newConfig = { ...state.config, ...action.config };
      return {
        ...makeInitialState(newConfig),
        phase: "paused" as const,
        question: action.question,
        config: newConfig,
        sessionId: action.sessionId,
        confidence: action.confidence,
        creditsUsed: action.creditsUsed,
        finalAnswer: action.finalAnswer,
        debateNotes: action.debateNotes,
        transcript: action.transcript,
        caveats: action.caveats,
        artifacts: action.artifacts,
        pauseReason: "credit_cap" as const,
        pauseTranscript: action.pauseTranscript,
        courtHappened: true,
      };
    }

    default:
      return state;
  }
}

export function useBrainSession(initialConfig?: Partial<CourtConfig>) {
  const [state, dispatch] = useReducer(reducer, initialConfig, makeInitialState);
  const abortRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "start":
        dispatch({ type: "SESSION_STARTED", sessionId: event.sessionId!, estimatedCredits: event.estimatedCredits ?? 0 });
        break;
      case "role_start":
        dispatch({ type: "ROLE_START", role: event.role!, round: event.round ?? 0, roleIndex: event.roleIndex ?? -1, provider: event.provider ?? "", attempt: event.attempt });
        break;
      case "content":
        dispatch({ type: "CONTENT_CHUNK", role: event.role!, content: event.content! });
        break;
      case "role_end":
        dispatch({ type: "ROLE_END", role: event.role! });
        break;
      case "round_start":
        dispatch({ type: "ROUND_START", round: event.round!, confidence: event.confidence ?? 0 });
        break;
      case "confidence_update":
        dispatch({ type: "CONFIDENCE_UPDATE", confidence: event.confidence!, creditsUsed: event.creditsUsed! });
        break;
      case "done":
        dispatch({
          type: "SESSION_DONE",
          payload: {
            confidence: event.confidence!,
            creditsUsed: event.creditsUsed!,
            finalAnswer: event.finalAnswer!,
            debateNotes: event.debateNotes || "",
            transcript: event.transcript || "",
            caveats: event.caveats || "",
            artifacts: event.artifacts || "",
            sessionId: event.sessionId!,
            pauseReason: event.pauseReason,
            pauseTranscript: event.transcriptLines,
          },
        });
        break;
      case "error":
        dispatch({ type: "ERROR", message: event.message || "Unknown error" });
        break;
    }
  }, []);

  const run = useCallback(async (questionOverride?: string) => {
    const effectiveQuestion = questionOverride ?? state.question;
    if (!effectiveQuestion.trim()) return;

    if (questionOverride && questionOverride !== state.question) {
      dispatch({ type: "SET_QUESTION", question: questionOverride });
    }

    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { /* guest */ }

    const request: BrainRunRequest = {
      question: effectiveQuestion,
      config: state.config,
      templateId: state.template?.id,
      idToken,
    };

    try {
      await runBrainSession(request, handleSSEEvent, abortRef.current.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        dispatch({ type: "ERROR", message: err?.message || "Session failed" });
      }
    }
  }, [state.question, state.config, state.template, user, handleSSEEvent]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_PHASE", phase: "complete" });
  }, []);

  const pause = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_PHASE", phase: "paused" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  const acceptPartial = useCallback(() => {
    dispatch({ type: "SET_PHASE", phase: "complete" });
  }, []);

  const stateRef = useRef<SessionState>(state);
  stateRef.current = state;

  const continueSessionFn = useCallback(async () => {
    const s = stateRef.current;
    if (!s.pauseTranscript?.length) return;

    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { /* guest */ }

    const request: BrainRunRequest = {
      question: s.question,
      config: s.config,
      templateId: s.template?.id,
      idToken,
      continueFromTranscript: s.pauseTranscript,
    };

    dispatch({ type: "SET_PHASE", phase: "running" });

    try {
      await runBrainSession(request, handleSSEEvent, abortRef.current.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        dispatch({ type: "ERROR", message: err?.message || "Continuation failed" });
      }
    }
  }, [user, handleSSEEvent]);

  const loadPausedSession = useCallback((s: {
    question: string;
    config: Partial<CourtConfig>;
    sessionId: string;
    confidence: number;
    creditsUsed: number;
    finalAnswer: string;
    debateNotes: string;
    transcript: string;
    caveats: string;
    artifacts: string;
  }) => {
    const pauseTranscript = s.transcript
      ? s.transcript.split("\n\n---\n\n").filter(Boolean)
      : [];
    dispatch({
      type: "PREFILL_PAUSED",
      ...s,
      pauseTranscript,
    });
  }, []);

  const setQuestion = useCallback((q: string) => dispatch({ type: "SET_QUESTION", question: q }), []);
  const setTemplate = useCallback((t: Template | null) => dispatch({ type: "SET_TEMPLATE", template: t }), []);
  const setConfig = useCallback((c: Partial<CourtConfig>) => dispatch({ type: "SET_CONFIG", config: c }), []);

  const setSeatAI = useCallback((seatId: string, assignment: SeatAssignment, litIndex?: number) => {
    dispatch({ type: "SET_SEAT_AI", seatId, assignment, litIndex });
  }, []);

  const applyFeedbackGrades = useCallback((thumbs: "good" | "bad", flow: "answer" | "build") => {
    dispatch({ type: "APPLY_FEEDBACK_GRADES", thumbs, flow });
  }, []);

  const submitRebuttal = useCallback(async (challenge: string) => {
    const s = stateRef.current;
    if (!s.finalAnswer || !s.sessionId) return;

    const newRound = s.rebuttalRound + 1;

    dispatch({
      type: "REBUTTAL_SUBMIT",
      newRound,
      challenge,
      prevSessionId: s.sessionId,
      prevFinalAnswer: s.finalAnswer,
    });

    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { /* guest */ }

    const rebuttalCtx: RebuttalContext = {
      challenge,
      originalVerdict: s.finalAnswer,
      rebuttalRound: newRound,
      parentSessionId: s.sessionId,
    };

    const request: BrainRunRequest = {
      question: s.question,
      config: s.config,
      templateId: s.template?.id,
      idToken,
      rebuttalContext: rebuttalCtx,
    };

    try {
      await runBrainSession(request, handleSSEEvent, abortRef.current.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        dispatch({ type: "ERROR", message: err?.message || "Rebuttal failed" });
      }
    }
  }, [user, handleSSEEvent]);

  return {
    state,
    run,
    stop,
    pause,
    reset,
    acceptPartial,
    continueSession: continueSessionFn,
    loadPausedSession,
    submitRebuttal,
    setQuestion,
    setTemplate,
    setConfig,
    setSeatAI,
    applyFeedbackGrades,
    ...(import.meta.env.DEV ? { _dispatch: dispatch } : {}),
  };
}
