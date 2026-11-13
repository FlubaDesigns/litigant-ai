import { canCreateArtifacts } from "@workspace/api-zod/session";
import { useReducer, useRef, useCallback, useEffect } from "react";
import { runBrainSession, updateSession, getSession, type SavedSession, type SSEEvent, type BrainRunRequest, type RebuttalContext, type CaseFileItem, type RelayContext } from "@/services/sessionService";
import type { Template, CourtConfig } from "@/data/templates";
import { type SeatAssignment } from "@/data/seatTypes";
import { useAuth } from "@/contexts/AuthContext";
import type { SessionState } from "./sessionStateTypes.js";
import { makeInitialState, reducer } from "./sessionReducer.js";
export type { SessionPhase, FeedItem, RebuttalRecord, SessionState } from "./sessionStateTypes.js";
export type { CaseFileItem, CourtroomOutcome, RelayContext } from "@/services/sessionService";
export { reducer as _reducerForTests, makeInitialState as _makeInitialStateForTests } from "./sessionReducer.js";

export function useBrainSession(initialConfig?: Partial<CourtConfig>) {
  const [state, dispatch] = useReducer(reducer, initialConfig, makeInitialState);
  const defaultConfigRef = useRef(initialConfig);
  defaultConfigRef.current = initialConfig;
  useEffect(() => {
    if (initialConfig && state.canLoadDefaults) dispatch({ type: "LOAD_DEFAULTS", config: initialConfig });
  }, [initialConfig, state.canLoadDefaults]);
  const abortRef = useRef<AbortController | null>(null);
  const acceptingRef = useRef(false);
  const { user, userProfile, isAdmin } = useAuth();
  const stoppedVersion = useRef(0);
  const runningSessionId = useRef<string | null>(null);
  useEffect(() => () => { ++stoppedVersion.current; abortRef.current?.abort(); }, []);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.config) dispatch({ type: "SET_CONFIG", config: event.config });
    switch (event.type) {
      case "start":
        runningSessionId.current = event.sessionId ?? null;
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
            settlementStatus: event.settlementStatus,
            creditsReserved: event.creditsReserved,
            creditsDebited: event.creditsDebited,
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
    if (!effectiveQuestion.trim() || (abortRef.current && !abortRef.current.signal.aborted)) return;
    runningSessionId.current = null;

    if (questionOverride && questionOverride !== state.question) {
      dispatch({ type: "SET_QUESTION", question: questionOverride });
    }

    dispatch({ type: "SET_PHASE", phase: "running" });
    ++stoppedVersion.current;
    const controller = new AbortController();
    abortRef.current = controller;

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "ERROR", message: "Sign-in expired. Please sign in again." });
      if (abortRef.current === controller) abortRef.current = null;
      return;
    }
    if (controller.signal.aborted) return;

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
      await runBrainSession(request, event => { if (!controller.signal.aborted) handleSSEEvent(event); }, controller.signal);
    } catch (err: any) {
      if (!controller.signal.aborted && err?.name !== "AbortError") {
        dispatch({ type: "ERROR", message: err?.message || "Session failed" });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [state.question, state.config, state.template, state.caseFile, state.failoverProvider, user, handleSSEEvent]);

  const stop = useCallback(() => {
    if (!abortRef.current || abortRef.current.signal.aborted) return;
    abortRef.current.abort();
    const version = ++stoppedVersion.current;
    const savedMemory = canCreateArtifacts(userProfile?.plan, isAdmin);
    const sessionId = runningSessionId.current;
    dispatch({type: "STOP_LOCAL", savedMemory});
    if (!savedMemory) return;
    if (!sessionId || !user) { dispatch({type: "STOP_UNCONFIRMED"}); return; }
    void (async () => {
      try {
        const token = await user.getIdToken();
        // Allow the provider abort and server persistence to finish. A timeout
        // never claims cancellation was saved or that a refund was posted.
        const deadline = Date.now() + 30_000;
        while (version === stoppedVersion.current && Date.now() < deadline) {
          try {
            const saved = await getSession(sessionId, token);
            if (version !== stoppedVersion.current) return;
            if (!saved.activeRun && ["cancelled", "complete", "error"].includes(saved.status)) {
              dispatch({type: "RESTORE_SESSION", session: saved});
              return;
            }
          } catch { /* New sessions may not exist until partial persistence. */ }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch { /* Sign-in or network failure: retain local partial text. */ }
      if (version === stoppedVersion.current) dispatch({type: "STOP_UNCONFIRMED"});
    })();
  }, [user, userProfile?.plan, isAdmin]);

  const pause = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "SET_PHASE", phase: "paused" });
  }, []);

  const reset = useCallback(() => {
    ++stoppedVersion.current;
    abortRef.current?.abort();
    dispatch({ type: "RESET", config: defaultConfigRef.current });
  }, []);

  const stateRef = useRef<SessionState>(state);
  stateRef.current = state;

  const acceptPartial = useCallback(async () => {
    const s = stateRef.current;
    if (!s.sessionId || s.phase !== "paused" || s.pauseReason === "output_incomplete" || acceptingRef.current) return;
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
    if (!s.sessionId || acceptingRef.current || (abortRef.current && !abortRef.current.signal.aborted)) return;
    runningSessionId.current = s.sessionId;

    dispatch({ type: "SET_PHASE", phase: "running" });
    ++stoppedVersion.current;
    const controller = new AbortController();
    abortRef.current = controller;

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "RECOVERY_FAILED", previous: s, message: "Sign-in expired. Please sign in again." });
      if (abortRef.current === controller) abortRef.current = null;
      return;
    }
    if (controller.signal.aborted) return;

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
      await runBrainSession(request, event => {
        if (controller.signal.aborted) return;
        if (event.type === "error") dispatch({type: "RECOVERY_FAILED", previous: s, message: event.message ?? "The attempt failed. Check History before retrying."});
        else handleSSEEvent(event);
      }, controller.signal);
    } catch (err: any) {
      if (!controller.signal.aborted && err?.name !== "AbortError") {
        dispatch({ type: "RECOVERY_FAILED", previous: s, message: err?.message || "Continuation failed" });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [user, handleSSEEvent]);

  const loadSession = useCallback((session: SavedSession) => {
    ++stoppedVersion.current;
    abortRef.current?.abort();
    dispatch({ type: "RESTORE_SESSION", session });
  }, []);

  const setQuestion = useCallback((q: string) => dispatch({ type: "SET_QUESTION", question: q }), []);
  const setTemplate = useCallback((t: Template | null) => dispatch({ type: "SET_TEMPLATE", template: t }), []);
  const setConfig = useCallback((c: Partial<CourtConfig>) => dispatch({ type: "SET_CONFIG", config: c }), []);

  const setSeatAI = useCallback((seatId: string, assignment: SeatAssignment, litIndex?: number) => {
    dispatch({ type: "SET_SEAT_AI", seatId, assignment, litIndex });
  }, []);

  const submitRebuttal = useCallback(async (challenge: string) => {
    const s = stateRef.current;
    if (!s.finalAnswer || !s.sessionId || (abortRef.current && !abortRef.current.signal.aborted)) return;
    runningSessionId.current = null;

    const newRound = s.rebuttalRound + 1;

    dispatch({
      type: "REBUTTAL_SUBMIT",
      newRound,
      challenge,
      prevSessionId: s.sessionId,
      prevFinalAnswer: s.finalAnswer,
    });

    dispatch({ type: "SET_PHASE", phase: "running" });
    ++stoppedVersion.current;
    const controller = new AbortController();
    abortRef.current = controller;

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "RECOVERY_FAILED", previous: s, message: "Sign-in expired. Please sign in again." });
      if (abortRef.current === controller) abortRef.current = null;
      return;
    }
    if (controller.signal.aborted) return;

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
      await runBrainSession(request, event => {
        if (controller.signal.aborted) return;
        if (event.type === "error") dispatch({type: "RECOVERY_FAILED", previous: s, message: event.message ?? "The attempt failed. Check History before retrying."});
        else handleSSEEvent(event);
      }, controller.signal);
    } catch (err: any) {
      if (!controller.signal.aborted && err?.name !== "AbortError") {
        dispatch({ type: "RECOVERY_FAILED", previous: s, message: err?.message || "Rebuttal failed" });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [user, handleSSEEvent]);

  const submitRelay = useCallback(async (missingInfo: string) => {
    const s = stateRef.current;
    if (!s.sessionId || !missingInfo.trim() || (abortRef.current && !abortRef.current.signal.aborted)) return;
    runningSessionId.current = null;

    const relayRound = s.relayCount + 1;

    dispatch({
      type: "RELAY_SUBMIT",
      relayRound,
      missingInfo,
      prevSessionId: s.sessionId,
    });

    dispatch({ type: "SET_PHASE", phase: "running" });
    ++stoppedVersion.current;
    const controller = new AbortController();
    abortRef.current = controller;

    let idToken: string | undefined;
    try {
      idToken = (await user?.getIdToken()) ?? undefined;
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "RECOVERY_FAILED", previous: s, message: "Sign-in expired. Please sign in again." });
      if (abortRef.current === controller) abortRef.current = null;
      return;
    }
    if (controller.signal.aborted) return;

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
      await runBrainSession(request, event => {
        if (controller.signal.aborted) return;
        if (event.type === "error") dispatch({type: "RECOVERY_FAILED", previous: s, message: event.message ?? "The attempt failed. Check History before retrying."});
        else handleSSEEvent(event);
      }, controller.signal);
    } catch (err: any) {
      if (!controller.signal.aborted && err?.name !== "AbortError") {
        dispatch({ type: "RECOVERY_FAILED", previous: s, message: err?.message || "Relay failed" });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [user, handleSSEEvent]);


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
    setQuestion,
    setTemplate,
    setConfig,
    setSeatAI,
    addCaseFile,
    removeCaseFile,
    ...(import.meta.env.DEV ? { _dispatch: dispatch } : {}),
  };
}
