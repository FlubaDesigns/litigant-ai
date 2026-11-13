import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getSeatBriefs, patchSeatBrief, deleteSeatBrief, type SeatBriefsData } from "@/services/adminService";
import { TabSkeleton } from "./AdminShared";

export const SEAT_LABELS: Record<string, string> = {
  orchestrator: "Orchestrator", moderator: "Moderator", architect: "Architect",
  builder: "Builder", auditor: "Auditor", litigant: "Litigant",
};

export function SeatOrdersTab() {
  const qc = useQueryClient();
  const [editingSeat, setEditingSeat] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const { data, isLoading, isError, refetch } = useQuery<SeatBriefsData>({
    queryKey: ["admin-seat-orders"], queryFn: getSeatBriefs, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const saveMut = useMutation({
    mutationFn: async ({ seatId, text }: { seatId: string; text: string }) => {
      await patchSeatBrief(seatId, text);
      const saved = await getSeatBriefs();
      if (saved.active[seatId] !== text.trim()) throw new Error("Saved rules could not be verified. Your draft is still here.");
      return saved;
    },
    onSuccess: (saved) => {
      qc.setQueryData(["admin-seat-orders"], saved);
      setEditingSeat(null);
      toast.success("Order saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resetMut = useMutation({
    mutationFn: async (seatId: string) => {
      await deleteSeatBrief(seatId);
      return getSeatBriefs();
    },
    onSuccess: (saved) => {
      qc.setQueryData(["admin-seat-orders"], saved);
      setEditingSeat(null);
      toast.success("Default restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <TabSkeleton />;
  if (isError || !data) return <div role="alert">Failed to load seat orders. <Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;
  const busy = saveMut.isPending || resetMut.isPending;
  return <div className="space-y-2">
    {data.seatIds.map(seatId => {
      const open = editingSeat === seatId;
      const label = SEAT_LABELS[seatId] ?? seatId;
      return <section key={seatId} className="lgt-card lgt-card--compact">
        <button type="button" className="flex items-center justify-between gap-3 w-full min-h-11 text-left" aria-expanded={open} aria-controls={`seat-order-${seatId}`} aria-label={`Edit ${label}`} disabled={busy || (!!editingSeat && !open)} onClick={() => {
          if (open) return;
          setDraftText(data.active[seatId] ?? "");
          setEditingSeat(seatId);
        }}>
          <span className="font-semibold">{label}</span>
          <span className="text-sm text-primary">{open ? "Editing" : "Edit"}</span>
        </button>
        {open && <div id={`seat-order-${seatId}`} className="space-y-3 pt-2">
          <Textarea aria-label={`${label} instructions`} value={draftText} onChange={e => setDraftText(e.target.value)} className="min-h-[40vh] font-mono text-base leading-relaxed" disabled={busy} />
          <div className="row layout__split-2 layout--keep-columns">
            <Button variant="outline" onClick={() => setEditingSeat(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => saveMut.mutate({seatId,text:draftText})} disabled={busy || !draftText.trim()}>{saveMut.isPending ? "Saving…" : "Save"}</Button>
          </div>
          {!!data.overrides?.[seatId] && <Button variant="ghost" size="sm" disabled={busy} onClick={() => resetMut.mutate(seatId)}>Reset to default</Button>}
        </div>}
      </section>;
    })}
  </div>;
}
