import { cn } from "@/lib/utils";
import { CourtDiagram } from "@/components/CourtDiagram";
import { SeatInspector } from "@/components/SeatInspector";
import { makeDefaultSeatMap } from "@/data/seatTypes";
import type { SeatAssignment } from "@/data/seatTypes";
import type { ProviderInfo } from "@/services/providerService";
import type { SessionState } from "@/lib/sessionExport";

// ── RuntimeControl (previously a top-level function in Session.tsx) ───────────

function RuntimeControl({
  starting, current, used, round, maxRound, cap,
}: {
  starting: number; current: number; used: number;
  round: number; maxRound: number; cap: number;
}) {
  const cells = [
    { label: "STARTING",   value: String(starting), color: "text-white" },
    { label: "CURRENT",    value: String(current),  color: current < 10 ? "text-red-400" : current < 30 ? "text-yellow-400" : "text-primary" },
    { label: "USED",       value: String(used),      color: "text-white" },
    { label: "ROUND",      value: `${round} / ${maxRound}`, color: "text-white" },
    { label: "CREDIT CAP", value: cap > 0 ? `~${cap}` : "—", color: "text-muted-foreground" },
  ];
  return (
    <div className="rounded-lg border border-primary/20 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-primary/10 bg-primary/5">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Runtime Control</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-primary/10">
        {cells.map(({ label, value, color }) => (
          <div key={label} className="bg-[#070f07] px-3 py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">{label}</div>
            <div className={cn("text-[15px] font-bold font-mono leading-none", color)}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SessionDiagramProps {
  state: SessionState;
  credits: number;
  isIdle: boolean;
  isRunning: boolean;
  isComplete: boolean;
  inspectorSeat: { seatId: string; litIndex?: number } | null;
  allProviders: ProviderInfo[];
  activityLogOpen: boolean;
  setActivityLogOpen: (v: boolean) => void;
  activityLogRef: React.RefObject<HTMLDivElement | null>;
  onSeatClick: (seatId: string, litIndex?: number) => void;
  onSeatUpdate: (seatId: string, assignment: SeatAssignment, litIndex?: number) => void;
  onAddLitigant: () => void;
  onRemoveLitigant: () => void;
  onCloseInspector: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionDiagram({
  state,
  credits,
  isIdle,
  isRunning,
  isComplete,
  inspectorSeat,
  allProviders,
  activityLogOpen,
  setActivityLogOpen,
  activityLogRef,
  onSeatClick,
  onSeatUpdate,
  onAddLitigant,
  onRemoveLitigant,
  onCloseInspector,
}: SessionDiagramProps) {
  const seatMap = state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount);

  return (
    <div className="row row--grow row--full">
      <div className="sz-diagram">

        {/* Runtime panel — hidden when idle */}
        {!isIdle && (
          <div className="sz-runtime">
            <div className="sz-runtime-label">Runtime Control</div>
            <RuntimeControl
              starting={credits + state.creditsUsed}
              current={credits}
              used={state.creditsUsed}
              round={state.currentRound}
              maxRound={state.config.maxIterations}
              cap={state.estimatedCredits}
            />

            {/* Activity Log */}
            <div className="actlog">
              <button onClick={() => setActivityLogOpen(!activityLogOpen)} className="actlog-hd">
                <span className="actlog-hd-label">
                  Activity Log
                  {isRunning && [0, 120, 240].map((d) => (
                    <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce inline-block" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
                <span className="actlog-chevron">{activityLogOpen ? "▼" : "▶"}</span>
              </button>
              {activityLogOpen && (
                <div ref={activityLogRef} className="actlog-bd">
                  {state.activityLog.map((entry, i) => {
                    const col = entry.startsWith("[Courtroom]") ? "#7ab87a"
                      : entry.startsWith("[Orchestrator]") ? "#d4b75a"
                      : entry.startsWith("[Moderator]") ? "#6ab4c0"
                      : entry.startsWith("[System]") ? "#5a5a5a"
                      : "#7ab87a";
                    return <div key={i} className="actlog-entry" style={{ color: col }}>{entry}</div>;
                  })}
                  {state.activityLog.length === 0 && (
                    <div className="actlog-entry" style={{ color: "#3a5a3a" }}>Waiting…</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Court Diagram */}
        <div className="relative flex-1 min-h-0" style={{ minHeight: "clamp(200px, 60vw, 480px)" }}>
          <CourtDiagram
            activeRole={state.activeRole}
            activeAttempt={state.activeAttempt}
            litigantCount={state.config.litigantCount}
            running={isRunning}
            confidence={state.confidence}
            creditsUsed={state.creditsUsed}
            estimatedCredits={state.estimatedCredits}
            complete={isComplete}
            seatMap={seatMap}
            grades={state.grades}
            onSeatClick={onSeatClick}
            onAddLitigant={!isRunning ? onAddLitigant : undefined}
            onRemoveLitigant={!isRunning ? onRemoveLitigant : undefined}
          />
          {(isRunning || isComplete) && state.currentRound > 0 && state.currentRound < 99 && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 border border-primary/25 text-[10px] font-mono text-primary/80 pointer-events-none">
              <span className={cn("w-1.5 h-1.5 rounded-full bg-primary", isRunning && "animate-pulse")} />
              Revolution {state.currentRound} / {state.config.maxIterations}
            </div>
          )}
        </div>

        {/* Seat Inspector */}
        {inspectorSeat && (
          <SeatInspector
            seatId={inspectorSeat.seatId}
            litIndex={inspectorSeat.litIndex}
            seatMap={seatMap}
            grades={state.grades}
            providers={allProviders}
            globalIntelligenceLevel={state.config.intelligenceLevel ?? 50}
            onClose={onCloseInspector}
            onUpdate={(seatId, assignment, li) => onSeatUpdate(seatId, assignment, li)}
          />
        )}

      </div>
    </div>
  );
}
