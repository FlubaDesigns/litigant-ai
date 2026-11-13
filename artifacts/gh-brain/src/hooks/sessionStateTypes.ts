import { type SavedSession, type PauseReason, type CaseFileItem, type CourtroomOutcome } from "@/services/sessionService";
import type { Template, CourtConfig } from "@/data/templates";
import { type GradeMap, type SeatAssignment } from "@/data/seatTypes";

export type SessionPhase =
  | "idle"
  | "configuring"
  | "running"
  | "paused"
  | "complete"
  | "cancelled"
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
  settlementStatus: "pending" | "settled" | null;
  creditsReserved: number;
  creditsDebited: number;
  stopPersistence: "pending" | "saved" | "unconfirmed" | "not_saved" | null;
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

export type Action =
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
        settlementStatus?: "pending" | "settled";
        creditsReserved?: number;
        creditsDebited?: number;
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
  | { type: "RECOVERY_FAILED"; previous: SessionState; message: string }
  | { type: "STOP_LOCAL"; savedMemory: boolean }
  | { type: "STOP_UNCONFIRMED" }
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
