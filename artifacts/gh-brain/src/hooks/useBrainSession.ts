import { CourtConfigSchema, restoreCourtConfig } from "@workspace/api-zod/session";
import { useReducer, useRef, useCallback, useEffect } from "react";
import { runBrainSession, updateSession, type SavedSession, type SSEEvent, type BrainRunRequest, type PauseReason, type RebuttalContext, type CaseFileItem, type CourtroomOutcome, type RelayContext } from "@/services/sessionService";
export type { CaseFileItem, CourtroomOutcome, RelayContext };
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
  | "relay_needed"
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
  /** Late profile defaults may initialize only an untouched new session. */
  canLoadDefaults: boolean;
  acceptingAnswer: boolean;
  acceptanceError: string | null;
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
  /** Pre-briefing documents / URLs attached before this session run. */
  caseFile: CaseFileItem[];
  /**
   * When a provider failover occurs during a run, the backup provider name is
   * stored here so all subsequent turns are pinned to it.
   */
  failoverProvider: string | null;
  /** Which pipeline branch was taken (set on done/courtroom_outcome). */
  artifactPath: "artifact" | "no-artifact" | null;
  /** Structured metadata about why/how the session terminated. */
  courtroomOutcome: CourtroomOutcome | null;
  /** Number of relay rounds completed. */
  relayCount: number;
  /**
   * When Auditor (no-artifact) flagged NOT_ENOUGH, this is the specific
   * missing information the user must supply. Triggers a relay prompt.
   */
  relayQuestion: string | null;
  /** Whether this session is waiting for a user relay answer. */
  needsRelay: boolean;
  /**
   * End-of-job tap — null = not yet tapped; only relevant when relayCount >= 1.
   */
  endOfJobTap: "worth_it" | "not_worth_it" | null;
}

type Action =
  | { type: "LOAD_DEFAULTS"; config: Partial<CourtConfig> }
  | { type: "ACCEPT_START"; sessionId: string }
  | { type: "ACCEPT_SAVED"; sessionId: string }
  | { type: "ACCEPT_FAILED"; sessionId: string; message: string }
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
        status: SavedSession["status"];
        caseFile?: CaseFileItem[];
        rebuttalRound?: number;
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
        artifactPath?: "artifact" | "no-artifact";
        courtroomOutcome?: CourtroomOutcome;
        relayCount?: number;
        relayQuestion?: string;
        needsRelay?: boolean;
        endOfJobTap?: "worth_it" | "not_worth_it" | null;
      };
    }
  | { type: "ERROR"; message: string }
  | { type: "PROVIDER_FAILOVER"; provider: string }
  | { type: "COURTROOM_OUTCOME"; courtroomOutcome: CourtroomOutcome; artifactPath: "artifact" | "no-artifact" }
  | { type: "SET_END_OF_JOB_TAP"; tap: "worth_it" | "not_worth_it" }
  | { type: "RESET"; config?: Partial<CourtConfig> }
  | { type: "ADD_CASE_FILE"; item: CaseFileItem }
  | { type: "REMOVE_CASE_FILE"; id: string }
  | { type: "REBUTTAL_SUBMIT"; newRound: number; challenge: string; prevSessionId: string; prevFinalAnswer: string }
  | { type: "RESTORE_SESSION"; session: SavedSession }
  | {
      type: "RELAY_SUBMIT";
      relayRound: number;
      missingInfo: string;
      prevSessionId: string;
    };

function phaseForStatus(status: SavedSession["status"]): SessionPhase {
  return status === "complete" ? "complete" : status === "relay_needed" ? "relay_needed"
    : status === "incomplete" || status === "paused_credit_cap" ? "paused" : "error";
}

function makeInitialState(initialConfig?: Partial<CourtConfig>): SessionState {
  const litigantCount = initialConfig?.litigantCount ?? DEFAULT_CONFIG.litigantCount;
  const config = restoreCourtConfig({ ...initialConfig, seatMap: initialConfig?.seatMap ?? makeDefaultSeatMap(litigantCount) });
  return {
    canLoadDefaults: initialConfig === undefined,
    acceptingAnswer: false,
    acceptanceError: null,
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
    caseFile: [],
    failoverProvider: null,
    artifactPath: null,
    courtroomOutcome: null,
    relayCount: 0,
    relayQuestion: null,
    needsRelay: false,
    endOfJobTap: null,
  };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "LOAD_DEFAULTS":
      if (!state.canLoadDefaults || state.sessionId || !["idle", "configuring"].includes(state.phase)) return state;
      return { ...state, config: makeInitialState(action.config).config, canLoadDefaults: false };

    case "SET_QUESTION":
      return { ...state, question: action.question };

    case "SET_TEMPLATE":
      return {
        ...state,
        canLoadDefaults: false,
        template: action.template,
        config: action.template
          ? CourtConfigSchema.parse({
              ...action.template.defaultConfig,
              seatMap: state.config.seatMap ? {...state.config.seatMap, litigants: syncLitigantSeats(state.config.seatMap.litigants, action.template.defaultConfig.litigantCount)} : makeDefaultSeatMap(action.template.defaultConfig.litigantCount),
            })
          : state.config,
      };

    case "SET_CONFIG": {
      const newConfig = CourtConfigSchema.parse({ ...state.config, ...action.config });
      // Sync seatMap litigant seats when litigantCount changes
      if (action.config.litigantCount !== undefined && newConfig.seatMap) {
        newConfig.seatMap = {
          ...newConfig.seatMap,
          litigants: syncLitigantSeats(newConfig.seatMap.litigants, newConfig.litigantCount),
        };
      }
      return { ...state, config: newConfig, canLoadDefaults: false };
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
      return { ...state, config: { ...state.config, seatMap: updated }, canLoadDefaults: false };
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
      return { ...state, phase: action.phase, canLoadDefaults: action.phase === "running" ? false : state.canLoadDefaults };

    case "SESSION_STARTED":
      return {
        ...state,
        canLoadDefaults: false,
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
        failoverProvider: null,
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

    case "SESSION_DONE": {
      const p = action.payload;
      const phase = phaseForStatus(p.status);
      return {
        ...state,
        phase,
        activeRole: null,
        confidence: p.confidence,
        creditsUsed: p.creditsUsed,
        finalAnswer: p.finalAnswer,
        caseFile: p.caseFile ?? state.caseFile,
        rebuttalRound: p.rebuttalRound ?? state.rebuttalRound,
        debateNotes: p.debateNotes,
        transcript: p.transcript,
        caveats: p.caveats,
        artifacts: p.artifacts,
        sessionId: p.sessionId,
        pauseReason: phase === "paused" ? (p.status === "paused_credit_cap" ? "credit_cap" : "iteration_limit") : null,
        pauseTranscript: p.pauseTranscript ?? null,
        artifactPath: p.artifactPath ?? state.artifactPath,
        courtroomOutcome: p.courtroomOutcome ?? state.courtroomOutcome,
        relayCount: p.relayCount ?? state.relayCount,
        relayQuestion: p.relayQuestion ?? null,
        needsRelay: p.status === "relay_needed",
        endOfJobTap: p.endOfJobTap ?? null,
        activityLog: [...state.activityLog, `[Orchestrator] final delivery — ${p.confidence}% confidence`],
      };
    }

    case "ACCEPT_START":
      return state.sessionId === action.sessionId
        ? { ...state, acceptingAnswer: true, acceptanceError: null } : state;
    case "ACCEPT_SAVED":
      return state.sessionId === action.sessionId
        ? { ...state, phase: "complete", acceptingAnswer: false, acceptanceError: null,
            pauseReason: null, pauseTranscript: null, needsRelay: false, relayQuestion: null } : state;
    case "ACCEPT_FAILED":
      return state.sessionId === action.sessionId
        ? { ...state, acceptingAnswer: false, acceptanceError: action.message } : state;

    case "ERROR":
      return { ...state, phase: "error", activeRole: null, failoverProvider: null, errorMessage: action.message,
        runtimeFeed: state.runtimeFeed.map(item => ({...item, isComplete: true})) };

    case "PROVIDER_FAILOVER":
      return { ...state, failoverProvider: action.provider,
        runtimeFeed: state.runtimeFeed.map(item => item.isComplete ? item : {...item, provider:action.provider, content:""}) };

    case "COURTROOM_OUTCOME":
      return {
        ...state,
        courtroomOutcome: action.courtroomOutcome,
        artifactPath: action.artifactPath,
      };

    case "SET_END_OF_JOB_TAP":
      return { ...state, endOfJobTap: action.tap };

    case "RELAY_SUBMIT":
      return {
        ...state,
        phase: "running",
        runtimeFeed: [],
        activityLog: [`[System] Relay round ${action.relayRound} — court incorporating your information…`],
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
        relayQuestion: null,
        needsRelay: false,
      };

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
      return makeInitialState(action.config);

    case "ADD_CASE_FILE":
      return { ...state, caseFile: [...state.caseFile, action.item] };

    case "REMOVE_CASE_FILE":
      return { ...state, caseFile: state.caseFile.filter((i) => i.id !== action.id) };

    case "RESTORE_SESSION": {
      const saved = action.session;
      const phase = phaseForStatus(saved.status);
      return {
        ...makeInitialState(saved.config),
        canLoadDefaults: false,
        phase,
        question: saved.question,
        template: saved.template ?? null,
        sessionId: saved.id,
        confidence: saved.confidence ?? 0,
        creditsUsed: saved.creditsUsed ?? 0,
        finalAnswer: saved.finalAnswer ?? "",
        debateNotes: saved.debateNotes ?? "",
        transcript: saved.transcript ?? "",
        caveats: saved.caveats ?? "",
        artifacts: saved.artifacts ?? "",
        caseFile: saved.caseFile ?? [],
        artifactPath: saved.artifactPath ?? null,
        courtroomOutcome: saved.courtroomOutcome ?? null,
        relayCount: saved.relayCount ?? 0,
        relayQuestion: saved.relayQuestion ?? null,
        needsRelay: phase === "relay_needed",
        rebuttalRound: saved.rebuttalRound ?? 0,
        pauseReason: phase === "paused" ? (saved.status === "paused_credit_cap" ? "credit_cap" : "iteration_limit") : null,
        pauseTranscript: (saved.transcript ?? "").split("\n\n---\n\n").filter(Boolean),
        errorMessage: phase === "error" ? "This session did not complete." : null,
        courtHappened: true,
      };
    }

    default:
      return state;
  }
}

/** Exported for unit testing only — do not use outside of tests. */
export { reducer as _reducerForTests, makeInitialState as _makeInitialStateForTests };

export function useBrainSession(initialConfig?: Partial<CourtConfig>) {
  const [state, dispatch] = useReducer(reducer, initialConfig, makeInitialState);
  const defaultConfigRef = useRef(initialConfig);
  defaultConfigRef.current = initialConfig;
  useEffect(() => {
    if (initialConfig && state.canLoadDefaults) dispatch({ type: "LOAD_DEFAULTS", config: initialConfig });
  }, [initialConfig, state.canLoadDefaults]);
  const abortRef = useRef<AbortController | null>(null);
  const acceptingRef = useRef(false);
  const { user } = useAuth();

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.config) dispatch({ type: "SET_CONFIG", config: event.config });
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
      case "courtroom_outcome":
        if (event.courtroomOutcome && event.artifactPath) {
          dispatch({ type: "COURTROOM_OUTCOME", courtroomOutcome: event.courtroomOutcome, artifactPath: event.artifactPath });
        }
        break;
      case "paused_post_moderator":
      case "done":
        if (!event.status) {
          dispatch({ type: "ERROR", message: "Session completion was not confirmed. Reload it from History." });
          break;
        }
        dispatch({
          type: "SESSION_DONE",
          payload: {
            status: event.status,
            caseFile: event.caseFile,
            rebuttalRound: event.rebuttalRound,
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
            artifactPath: event.artifactPath,
            courtroomOutcome: event.courtroomOutcome,
            relayCount: event.relayCount,
            relayQuestion: event.relayQuestion,
            needsRelay: event.needsRelay,
            endOfJobTap: event.endOfJobTap,
          },
        });
        break;
      case "error":
        dispatch({ type: "ERROR", message: event.message || "Unknown error" });
        break;
      case "provider_failover":
        if (event.provider) dispatch({ type: "PROVIDER_FAILOVER", provider: event.provider });
        break;
    }
  }, []);

  const run = useCallback(async (questionOverride?: string, opts?: { overdraft?: boolean; configOverride?: Partial<CourtConfig> }) => {
    const effectiveQuestion = questionOverride ?? state.question;
    if (!effectiveQuestion.trim()) return;

    if (questionOverride && questionOverride !== state.question) {
      dispatch({ type: "SET_QUESTION", question: questionOverride });
    }

    dispatch({ type: "SET_PHASE", phase: "running" });
    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { dispatch({ type: "ERROR", message: "Sign-in expired. Please sign in again." }); return; }

    let effectiveConfig = opts?.configOverride
      ? { ...state.config, ...opts.configOverride }
      : state.config;

    const request: BrainRunRequest = {
      question: effectiveQuestion,
      config: effectiveConfig,
      templateId: state.template?.id,
      idToken,
      caseFile: state.caseFile.length > 0 ? state.caseFile : undefined,
      ...(opts?.overdraft ? { overdraft: true } : {}),
    };

    try {
      await runBrainSession(request, handleSSEEvent, abortRef.current.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        dispatch({ type: "ERROR", message: err?.message || "Session failed" });
      }
    }
  }, [state.question, state.config, state.template, state.caseFile, state.failoverProvider, user, handleSSEEvent]);

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
    dispatch({ type: "RESET", config: defaultConfigRef.current });
  }, []);

  const stateRef = useRef<SessionState>(state);
  stateRef.current = state;

  const acceptPartial = useCallback(async () => {
    const s = stateRef.current;
    if (!s.sessionId || s.phase !== "paused" || acceptingRef.current) return;
    acceptingRef.current = true;
    dispatch({ type: "ACCEPT_START", sessionId: s.sessionId });
    try {
      if (!user) throw new Error("Sign in to save an accepted answer.");
      const token = await user.getIdToken();
      const result = await updateSession(s.sessionId, { status: "complete" }, token);
      if (result.status !== "complete") throw new Error("Acceptance was not confirmed. Please retry.");
      dispatch({ type: "ACCEPT_SAVED", sessionId: s.sessionId });
    } catch (error) {
      dispatch({ type: "ACCEPT_FAILED", sessionId: s.sessionId,
        message: error instanceof Error ? error.message : "Could not save your acceptance. Please retry." });
    } finally {
      acceptingRef.current = false;
    }
  }, [user]);

  const continueSessionFn = useCallback(async (newMaxCredits?: number) => {
    const s = stateRef.current;
    if (!s.sessionId || acceptingRef.current) return;

    dispatch({ type: "SET_PHASE", phase: "running" });
    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { dispatch({ type: "ERROR", message: "Sign-in expired. Please sign in again." }); return; }

    const isCreditCapPause = s.pauseReason === "credit_cap";

    const effectiveConfig: typeof s.config =
      isCreditCapPause && newMaxCredits !== undefined
        ? { ...s.config, maxCredits: newMaxCredits }
        : s.config;

    const request: BrainRunRequest = {
      question: s.question,
      config: effectiveConfig,
      templateId: s.template?.id,
      caseFile: s.caseFile,
      idToken,
      sessionId: s.sessionId ?? undefined,
      continueFromTranscript: s.pauseTranscript ?? [],
      ...(isCreditCapPause ? { resumeWithFixedPipeline: true } : {}),
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

  const loadSession = useCallback((session: SavedSession) => {
    dispatch({ type: "RESTORE_SESSION", session });
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

    dispatch({ type: "SET_PHASE", phase: "running" });
    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { dispatch({ type: "ERROR", message: "Sign-in expired. Please sign in again." }); return; }

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
      caseFile: s.caseFile,
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

  const submitRelay = useCallback(async (missingInfo: string) => {
    const s = stateRef.current;
    if (!s.sessionId) return;

    const relayRound = s.relayCount + 1;

    dispatch({
      type: "RELAY_SUBMIT",
      relayRound,
      missingInfo,
      prevSessionId: s.sessionId,
    });

    dispatch({ type: "SET_PHASE", phase: "running" });
    abortRef.current = new AbortController();

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch { dispatch({ type: "ERROR", message: "Sign-in expired. Please sign in again." }); return; }

    const relayCtx: RelayContext = {
      missingInfo,
      relayRound,
      originalTranscript: s.pauseTranscript ?? s.transcript.split("\n\n---\n\n").filter(Boolean),
      parentSessionId: s.sessionId,
    };

    const request: BrainRunRequest = {
      question: s.question,
      config: s.config,
      templateId: s.template?.id,
      caseFile: s.caseFile,
      idToken,
      relayContext: relayCtx,
    };

    try {
      await runBrainSession(request, handleSSEEvent, abortRef.current.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        dispatch({ type: "ERROR", message: err?.message || "Relay failed" });
      }
    }
  }, [user, handleSSEEvent]);

  const setEndOfJobTap = useCallback((tap: "worth_it" | "not_worth_it") => {
    dispatch({ type: "SET_END_OF_JOB_TAP", tap });
  }, []);

  const addCaseFile = useCallback((item: CaseFileItem) => {
    dispatch({ type: "ADD_CASE_FILE", item });
  }, []);

  const removeCaseFile = useCallback((id: string) => {
    dispatch({ type: "REMOVE_CASE_FILE", id });
  }, []);

  return {
    state,
    run,
    stop,
    pause,
    reset,
    acceptPartial,
    continueSession: continueSessionFn,
    loadSession,
    submitRebuttal,
    submitRelay,
    setEndOfJobTap,
    setQuestion,
    setTemplate,
    setConfig,
    setSeatAI,
    applyFeedbackGrades,
    addCaseFile,
    removeCaseFile,
    ...(import.meta.env.DEV ? { _dispatch: dispatch } : {}),
  };
}
