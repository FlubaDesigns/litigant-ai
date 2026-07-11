import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEAT_AI_OPTIONS,
  SEAT_PURPOSES,
  SEAT_DEFAULT_GRADES,
  getGradeSummary,
  type SeatAssignment,
  type GradeMap,
  type SeatMapConfig,
} from "@/data/seatTypes";

interface SeatInspectorProps {
  seatId: string | null;
  litIndex?: number;
  seatMap: SeatMapConfig;
  grades: GradeMap;
  litigantCount: number;
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
  onClose,
  onUpdate,
}: SeatInspectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>("anthropic");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seatId) {
      const assignment = getCurrentAssignment(seatId, litIndex, seatMap);
      setSelectedProvider(assignment.provider);
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

  const selectedOption = SEAT_AI_OPTIONS.find((o) => o.id === selectedProvider) ?? SEAT_AI_OPTIONS[0];

  function handleConfirm() {
    if (!seatId) { handleClose(); return; }
    const defaultModels: Record<string, string> = {
      anthropic: "claude-opus-4-5",
      openai:    "gpt-4o",
      grok:      "grok-3",
      gemini:    "gemini-2.5-pro",
    };
    onUpdate(seatId, { provider: selectedProvider, model: defaultModels[selectedProvider] ?? selectedProvider }, litIndex);
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

          {/* AI picker */}
          <div className="mb-1 text-[10px] uppercase tracking-widest text-[#7ab87a] font-bold">
            Assigned AI
          </div>
          <div className="space-y-2 mb-4">
            {SEAT_AI_OPTIONS.map((opt) => {
              const isSelected = selectedProvider === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedProvider(opt.id)}
                  className={cn(
                    "w-full text-left rounded-xl border px-3.5 py-2.5 transition-all",
                    isSelected
                      ? "border-[#00c853] bg-[#00c853]/10"
                      : "border-[#1d331d] bg-black/20 hover:border-[#00c853]/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-none transition-colors",
                        isSelected ? "bg-[#00c853]" : "bg-[#1d331d]"
                      )} />
                      <span className={cn(
                        "text-sm font-bold",
                        isSelected ? "text-[#d7ff77]" : "text-white/70"
                      )}>
                        {opt.name}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[11px] font-bold px-1.5 py-0.5 rounded border",
                      isSelected
                        ? "border-[#00c853]/40 text-[#00c853] bg-[#00c853]/10"
                        : "border-[#1d331d] text-[#7ab87a] bg-transparent"
                    )}>
                      {opt.grade}
                    </span>
                  </div>
                  <p className={cn(
                    "text-[11px] mt-1 ml-4",
                    isSelected ? "text-white/60" : "text-white/30"
                  )}>
                    {opt.desc}
                  </p>
                </button>
              );
            })}
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
              Assign {selectedOption.shortName}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
