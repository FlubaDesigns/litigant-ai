import { CourtConfigSchema } from "@workspace/api-zod/session";
import { type SavedSession } from "@/services/sessionService";
import type { CourtConfig } from "@/data/templates";
import { DEFAULT_CONFIG } from "@/data/templates";
import { makeDefaultSeatMap, makeDefaultGrades, syncLitigantSeats, type SeatMapConfig } from "@/data/seatTypes";
import type { SessionPhase, SessionState, Action } from "./sessionStateTypes.js";

export function phaseForStatus(status: SavedSession["status"]): SessionPhase {
  return status === "cancelled" ? "cancelled" : status === "complete" ? "complete" : status === "relay_needed" ? "relay_needed"
    : status === "incomplete" || status === "paused_credit_cap" ? "paused" : "error";
}

export function makeInitialState(initialConfig?: Partial<CourtConfig>): SessionState {
  const litigantCount = initialConfig?.litigantCount ?? DEFAULT_CONFIG.litigantCount;
  const config = CourtConfigSchema.parse({ ...initialConfig, seatMap: initialConfig?.seatMap ?? makeDefaultSeatMap(litigantCount) });
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
    settlementStatus: null,
    creditsReserved: 0,
    creditsDebited: 0,
    stopPersistence: null,
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
  };
}

export function reducer(state: SessionState, action: Action): SessionState {
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
        settlementStatus: p.settlementStatus ?? null,
        creditsReserved: p.creditsReserved ?? 0,
        creditsDebited: p.creditsDebited ?? p.creditsUsed,
        stopPersistence: p.status === "cancelled" ? "saved" : null,
        finalAnswer: p.finalAnswer,
        caseFile: p.caseFile ?? state.caseFile,
        rebuttalRound: p.rebuttalRound ?? state.rebuttalRound,
        debateNotes: p.debateNotes,
        transcript: p.transcript,
        caveats: p.caveats,
        artifacts: p.artifacts,
        sessionId: p.sessionId,
        pauseReason: phase === "paused" ? (p.pauseReason ?? (p.status === "paused_credit_cap" ? "credit_cap" : "iteration_limit")) : null,
        pauseTranscript: p.pauseTranscript ?? null,
        artifactPath: p.artifactPath ?? state.artifactPath,
        courtroomOutcome: p.courtroomOutcome ?? state.courtroomOutcome,
        relayCount: p.relayCount ?? state.relayCount,
        relayQuestion: p.relayQuestion ?? null,
        needsRelay: p.status === "relay_needed",
        activityLog: [...state.activityLog, `[System] ${p.status} — ${p.confidence}/100 AI review`],
        runtimeFeed: state.runtimeFeed.map(item => ({...item, isComplete: true})),
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

    case "RECOVERY_FAILED":
      return {...action.previous, activeRole: null, errorMessage: action.message,
        runtimeFeed: [...action.previous.runtimeFeed, ...(state.runtimeFeed === action.previous.runtimeFeed ? [] : state.runtimeFeed)].map(item => ({...item,isComplete:true}))};
    case "STOP_LOCAL": {
      const transcript = state.runtimeFeed.filter(item => item.content).map(item => `**${item.role} (Round ${item.round}):**\n${item.content}`).join("\n\n---\n\n");
      return {...state, phase: "cancelled", activeRole: null,
        stopPersistence: action.savedMemory ? "pending" : "not_saved",
        transcript: [state.transcript, transcript].filter(Boolean).join("\n\n---\n\n"),
        runtimeFeed: state.runtimeFeed.map(item => ({...item, isComplete: true})),
        activityLog: [...state.activityLog, "[System] Stop requested. Partial output is not an approved result."]};
    }
    case "STOP_UNCONFIRMED":
      return state.phase === "cancelled" ? {...state, stopPersistence: "unconfirmed"} : state;

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
        settlementStatus: saved.settlementStatus ?? null,
        creditsReserved: saved.creditsReserved ?? 0,
        creditsDebited: saved.creditsDebited ?? saved.creditsUsed ?? 0,
        stopPersistence: saved.status === "cancelled" ? "saved" : null,
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
        pauseReason: phase === "paused" ? (saved.pauseReason ?? (saved.courtroomOutcome?.reason === "output_incomplete" ? "output_incomplete" : saved.status === "paused_credit_cap" ? "credit_cap" : "iteration_limit")) : null,
        pauseTranscript: saved.transcriptLines ?? [],
        errorMessage: phase === "error" ? "This session did not complete." : null,
        courtHappened: true,
      };
    }

    default:
      return state;
  }
}
