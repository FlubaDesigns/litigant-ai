import { useState, useEffect } from "react";
import { DollarSign, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [useMasterSettings, setUseMasterSettings] = useState(true);
  const [localLevel, setLocalLevel] = useState(50);
  const [localProvider, setLocalProvider] = useState("auto");

  useEffect(() => {
    if (seatId) {
      const assignment = getCurrentAssignment(seatId, litIndex, seatMap);
      setUseMasterSettings(assignment.useMasterSettings !== false);
      setLocalLevel(assignment.intelligenceLevel ?? globalIntelligenceLevel);
      setLocalProvider(assignment.provider ?? "auto");
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
    if (!seatId) { onClose(); return; }
    const assignment: SeatAssignment = {
      provider: resolved?.provider ?? "anthropic",
      model: resolved?.model,
      useMasterSettings,
      intelligenceLevel: useMasterSettings ? undefined : localLevel,
    };
    onUpdate(seatId, assignment, litIndex);
    onClose();
  }

  return (
    <Dialog open={!!seatId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-sm bg-[#080f08] border border-primary/40 p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center gap-2.5">
            <DialogTitle className="text-base font-bold text-white">{label}</DialogTitle>
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border", gradeColor(currentGrade))}>
              {currentGrade}
            </span>
          </div>
          <p className="text-xs text-primary/60 mt-0.5">{purpose}</p>
        </DialogHeader>

        <div className="px-5 pb-5 pt-4 space-y-3">
          <div className="px-3 py-2 rounded-lg border border-primary/15 bg-black/20 text-xs text-primary/60 font-mono">
            {gradeSummary}
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-primary/15 bg-black/20">
            <div>
              <div className="text-xs font-semibold text-white/80">Use session settings</div>
              <div className="text-[10px] text-primary/50 mt-0.5">
                {useMasterSettings
                  ? "Inherits intelligence level from the session"
                  : "Custom intelligence level for this seat"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUseMasterSettings(!useMasterSettings)}
              className={cn(
                "relative w-10 rounded-full transition-colors shrink-0",
                useMasterSettings ? "bg-primary" : "bg-white/10"
              )}
              style={{ minWidth: "2.5rem", height: "1.375rem" }}
              aria-label="Toggle session settings"
            >
              <span className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                useMasterSettings ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>

          {!useMasterSettings && (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-primary/60 font-bold">Provider</div>
                <div className="relative">
                  <select
                    value={localProvider}
                    onChange={(e) => setLocalProvider(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-primary/20 bg-black/20 text-sm text-white/80 px-3.5 py-2.5 pr-8 focus:outline-none focus:border-primary/50"
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

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-primary/60 font-bold">Intelligence</div>
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

          <div className="px-3 py-2.5 rounded-lg border border-primary/15 bg-black/20">
            <div className="text-[10px] uppercase tracking-widest text-primary/60 font-bold mb-1">Resolves to</div>
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

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-primary/20 text-sm text-white/50 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 h-10 rounded-xl text-sm font-bold transition-colors bg-primary text-[#071007]"
            >
              Apply
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
