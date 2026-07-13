import { useState, useEffect } from "react";
import { X, DollarSign, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEAT_PURPOSES,
  SEAT_DEFAULT_GRADES,
  getGradeSummary,
  type SeatAssignment,
  type GradeMap,
  type SeatMapConfig,
} from "@/data/seatTypes";
import { resolveModelByIntelligence, type ProviderInfo } from "@/services/providerService";

interface SeatInspectorProps {
  seatId: string | null;
  litIndex?: number;
  seatMap: SeatMapConfig;
  grades: GradeMap;
  providers: ProviderInfo[];
  globalIntelligenceLevel: number;
  onClose: () => void;
  onUpdate: (seatId: string, assignment: SeatAssignment, litIndex?: number) => void;
}

function getSeatLabel(seatId: string, litIndex?: number): string {
  if (seatId === "litigant" && litIndex !== undefined) return `Litigant ${litIndex + 1}`;
  return seatId.charAt(0).toUpperCase() + seatId.slice(1);
}

function getCurrentAssignment(
  seatId: string,
  litIndex: number | undefined,
  seatMap: SeatMapConfig
): SeatAssignment {
  if (seatId === "litigant" && litIndex !== undefined) {
    return seatMap.litigants[litIndex] ?? { provider: "anthropic" };
  }
  const key = seatId as keyof Omit<SeatMapConfig, "litigants">;
  return seatMap[key] ?? { provider: "anthropic" };
}

function getGradeKey(seatId: string, litIndex: number | undefined): string | null {
  if (seatId === "litigant") return null;
  return seatId;
}

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-primary border-primary/50 bg-primary/10",
  "A":  "text-primary border-primary/50 bg-primary/10",
  "A-": "text-primary/80 border-primary/30 bg-primary/5",
  "B+": "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  "B":  "text-yellow-400/80 border-yellow-400/20 bg-yellow-400/5",
  "B-": "text-yellow-500/70 border-yellow-500/20 bg-yellow-500/5",
};

function gradeColor(grade: string): string {
  return GRADE_COLOR[grade] ?? "text-muted-foreground border-border/30 bg-muted/5";
}

export function SeatInspector({
  seatId,
  litIndex,
  seatMap,
  grades,
  providers,
  globalIntelligenceLevel,
  onClose,
  onUpdate,
}: SeatInspectorProps) {
  const [open, setOpen] = useState(false);
  const [useMasterSettings, setUseMasterSettings] = useState(true);
  const [localLevel, setLocalLevel] = useState(50);
  const [localProvider, setLocalProvider] = useState("auto");

  useEffect(() => {
    if (seatId) {
      const assignment = getCurrentAssignment(seatId, litIndex, seatMap);
      setUseMasterSettings(assignment.useMasterSettings !== false);
      setLocalLevel(assignment.intelligenceLevel ?? globalIntelligenceLevel);
      setLocalProvider(assignment.provider ?? "auto");
      requestAnimationFrame(() => setOpen(true));
    } else {
      setOpen(false);
    }
  }, [seatId, litIndex]);

  if (!seatId) return null;

  const label = getSeatLabel(seatId, litIndex);
  const purpose = seatId === "litigant"
    ? "Participates in courtroom reasoning and debate."
    : (SEAT_PURPOSES[seatId] ?? "");
  const gradeKey = getGradeKey(seatId, litIndex);
  const gradeData = gradeKey ? grades[gradeKey] : undefined;
  const defaultGrade = gradeKey ? (SEAT_DEFAULT_GRADES[gradeKey] ?? "B+") : "B+";
  const currentGrade = gradeData?.grade ?? defaultGrade;
  const gradeSummary = getGradeSummary(gradeData);

  const effectiveLevel = useMasterSettings ? globalIntelligenceLevel : localLevel;
  const effectiveProvider = useMasterSettings ? "auto" : localProvider;
  const resolved = providers.length > 0
    ? resolveModelByIntelligence(effectiveLevel, effectiveProvider, providers)
    : null;

  function handleConfirm() {
    if (!seatId) { handleClose(); return; }
    const assignment: SeatAssignment = {
      provider: resolved?.provider ?? "anthropic",
      model: resolved?.model,
      useMasterSettings,
      intelligenceLevel: useMasterSettings ? undefined : localLevel,
    };
    onUpdate(seatId, assignment, litIndex);
    handleClose();
  }

  function handleClose() {
    setOpen(false);
    setTimeout(onClose, 220);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-200 seat-inspector-backdrop",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
      />

      {/* Bottom sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-220 ease-out rounded-t-2xl border-t border-[#1d331d] seat-inspector-sheet",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-6 pt-2">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{label}</h3>
                <span className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-full border",
                  gradeColor(currentGrade)
                )}>
                  {currentGrade}
                </span>
              </div>
              <p className="text-xs text-[#7ab87a] mt-0.5">{purpose}</p>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Run history */}
          <div className="mb-4 px-3 py-2 rounded-lg border border-[#1d331d] bg-black/20 text-xs text-[#7ab87a] font-mono">
            {gradeSummary}
          </div>

          {/* Master settings toggle */}
          <div className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-lg border border-[#1d331d] bg-black/20">
            <div>
              <div className="text-xs font-semibold text-white/80">Use session settings</div>
              <div className="text-[10px] text-[#7ab87a] mt-0.5">
                {useMasterSettings
                  ? "Inherits intelligence level from the session"
                  : "Custom intelligence level for this seat"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUseMasterSettings(!useMasterSettings)}
              className={cn(
                "relative w-10 h-5.5 rounded-full transition-colors shrink-0",
                useMasterSettings ? "bg-[#00c853]" : "bg-white/10"
              )}
              style={{ minWidth: "2.5rem", height: "1.375rem" }}
              aria-label="Toggle session settings"
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  useMasterSettings ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {/* Per-seat controls (only when not using master settings) */}
          {!useMasterSettings && (
            <div className="space-y-3 mb-4">
              {/* Provider dropdown */}
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[#7ab87a] font-bold">Provider</div>
                <div className="relative">
                  <select
                    value={localProvider}
                    onChange={(e) => setLocalProvider(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#1d331d] bg-black/20 text-sm text-white/80 px-3.5 py-2.5 pr-8 focus:outline-none focus:border-[#00c853]/50"
                  >
                    <option value="auto">Automatic (best match)</option>
                    {providers.map((p) => (
                      <option key={p.name} value={p.name}>{p.displayName}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Intelligence slider */}
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[#7ab87a] font-bold">Intelligence</div>
                <div className="flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-white/30 shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={localLevel}
                    onChange={(e) => setLocalLevel(Number(e.target.value))}
                    className="flex-1 cursor-pointer"
                    style={{ accentColor: "#00c853" }}
                  />
                  <GraduationCap className="w-4 h-4 text-white/30 shrink-0" />
                </div>
              </div>
            </div>
          )}

          {/* Resolved model preview */}
          <div className="mb-4 px-3 py-2.5 rounded-lg border border-[#1d331d] bg-black/20">
            <div className="text-[10px] uppercase tracking-widest text-[#7ab87a] font-bold mb-1">
              Resolves to
            </div>
            {resolved ? (
              <div className="text-sm font-semibold text-white/80">{resolved.label}</div>
            ) : (
              <div className="text-xs text-white/30 italic">Loading providers…</div>
            )}
            <div className="text-[10px] text-white/30 mt-0.5 font-mono">
              {useMasterSettings
                ? `Session level ${globalIntelligenceLevel}`
                : `Seat level ${localLevel}${localProvider !== "auto" ? ` · ${localProvider}` : ""}`}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 h-10 rounded-xl border border-[#1d331d] text-sm text-white/50 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 h-10 rounded-xl text-sm font-bold transition-colors bg-[#00c853] text-[#071007]"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
