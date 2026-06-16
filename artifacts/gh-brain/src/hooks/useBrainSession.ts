import { useReducer, useRef, useCallback } from "react";
import { runBrainSession, type SSEEvent, type BrainRunRequest } from "@/services/sessionService";
import type { Template, CourtConfig } from "@/data/templates";
import { DEFAULT_CONFIG } from "@/data/templates";
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
  content: string;
  round: number;
  timestamp: number;
  isComplete: boolean;
}

export interface SessionState {
  phase: SessionPhase;
  question: string;
  template: Template | null;
  config: CourtConfig;
  sessionId: string | null;
  runtimeFeed: FeedItem[];
  activeRole: string | null;
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
}

type Action =
  | { type: "SET_QUESTION"; question: string }
  | { type: "SET_TEMPLATE"; template: Template | null }
  | { type: "SET_CONFIG"; config: Partial<CourtConfig> }
  | { type: "SET_PHASE"; phase: SessionPhase }
  | { type: "SESSION_STARTED"; sessionId: string; estimatedCredits: number }
  | { type: "ROLE_START"; role: string; round: number }
  | { type: "CONTENT_CHUNK"; role: string; content: string }
  | { type: "ROLE_END"; role: string }
  | { type: "ROUND_START"; round: number }
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
      };
    }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

const initialState: SessionState = {
  phase: "idle",
  question: "",
  template: null,
  config: DEFAULT_CONFIG,
  sessionId: null,
  runtimeFeed: [],
  activeRole: null,
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
};

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "SET_QUESTION":
      return { ...state, question: action.question };
    case "SET_TEMPLATE":
      return {
        ...state,
        template: action.template,
        config: action.template ? { ...action.template.defaultConfig } : state.config,
      };
    case "SET_CONFIG":
      return { ...state, config: { ...state.config, ...action.config } };
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SESSION_STARTED":
      return {
        ...state,
        phase: "running",
        sessionId: action.sessionId,
        estimatedCredits: action.estimatedCredits,
        runtimeFeed: [],
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
    case "ROLE_START":
      return {
        ...state,
        activeRole: action.role,
        currentRound: action.round > 0 ? action.round : state.currentRound,
        runtimeFeed: [
          ...state.runtimeFeed,
          {
            id: `${action.role}-${action.round}-${Date.now()}`,
            role: action.role,
            content: "",
            round: action.round,
            timestamp: Date.now(),
            isComplete: false,
          },
        ],
      };
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
    case "ROUND_START":
      return { ...state, currentRound: action.round };
    case "CONFIDENCE_UPDATE":
      return { ...state, confidence: action.confidence, creditsUsed: action.creditsUsed };
    case "SESSION_DONE":
      return {
        ...state,
        phase: "complete",
        activeRole: null,
        confidence: action.payload.confidence,
        creditsUsed: action.payload.creditsUsed,
        finalAnswer: action.payload.finalAnswer,
        debateNotes: action.payload.debateNotes,
        transcript: action.payload.transcript,
        caveats: action.payload.caveats,
        artifacts: action.payload.artifacts,
        sessionId: action.payload.sessionId,
      };
    case "ERROR":
      return { ...state, phase: "error", activeRole: null, errorMessage: action.message };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

export function useBrainSession() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "start":
        dispatch({ type: "SESSION_STARTED", sessionId: event.sessionId!, estimatedCredits: event.estimatedCredits ?? 0 });
        break;
      case "role_start":
        dispatch({ type: "ROLE_START", role: event.role!, round: event.round ?? 0 });
        break;
      case "content":
        dispatch({ type: "CONTENT_CHUNK", role: event.role!, content: event.content! });
        break;
      case "role_end":
        dispatch({ type: "ROLE_END", role: event.role! });
        break;
      case "round_start":
        dispatch({ type: "ROUND_START", round: event.round! });
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

    // If an override is supplied, persist it into state so the running view shows it
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

  // Stop aborts the stream and marks the session complete with whatever was received
  const stop = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_PHASE", phase: "complete" });
  }, []);

  // Pause aborts the stream and transitions to "paused" so the user can review partial output
  const pause = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_PHASE", phase: "paused" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  const setQuestion = useCallback((q: string) => dispatch({ type: "SET_QUESTION", question: q }), []);
  const setTemplate = useCallback((t: Template | null) => dispatch({ type: "SET_TEMPLATE", template: t }), []);
  const setConfig = useCallback((c: Partial<CourtConfig>) => dispatch({ type: "SET_CONFIG", config: c }), []);

  return { state, run, stop, pause, reset, setQuestion, setTemplate, setConfig };
}
