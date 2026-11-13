import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Edit3, AlertTriangle, RotateCcw, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCreditPacks, createCreditPack, updateCreditPack, deactivateCreditPack, type AdminCreditPack, type CreditPackBounds } from "@/services/adminService";
import { TabSkeleton } from "./AdminShared";

export function CreditPacksTab() {
  const qc = useQueryClient();
  const [editingPack, setEditingPack] = useState<AdminCreditPack | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<AdminCreditPack | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-credit-packs"],
    queryFn: getCreditPacks,
    retry: false,
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateCreditPack(id),
    onSuccess: (_data: any, id: string) => {
      toast.success(`${id} deactivated`);
      qc.invalidateQueries({ queryKey: ["admin-credit-packs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => updateCreditPack(id, { active: true }),
    onSuccess: (_data: any, id: string) => {
      toast.success(`${id} reactivated`);
      qc.invalidateQueries({ queryKey: ["admin-credit-packs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Failed to load credit pack config — the server returned an error.
      </div>
    );
  }

  const activePacks = data.packs.filter((p) => p.active);
  const inactivePacks = data.packs.filter((p) => !p.active);

  return (
    <div className="space-y-6">
      <details className="lgt-card lgt-card--compact text-sm text-muted-foreground">
        <summary className="min-h-11 py-3 cursor-pointer font-medium text-foreground">How credit packs work</summary>
        <p className="pt-2">One-time top-ups sold on Billing. Pack IDs are permanent so Square can track pending and past purchases. Deactivate to hide a pack from checkout; its history stays and you can reactivate it anytime.</p>
      </details>

      <div className="admin-row flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Active packs</h3>
        <Button size="sm" onClick={() => setCreating(true)} className="min-h-11 gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New pack
        </Button>
      </div>

      {activePacks.length > 0 ? <div className="row layout__split-2">
        {activePacks.map((pack) => {
          const price = pack.prices[0];
          const credits = parseInt(pack.metadata.creditAmount, 10) || 0;
          const dollars = (price?.unit_amount ?? 0) / 100;
          const rate = dollars > 0 ? credits / dollars : 0;
          return (
            <article key={pack.id} aria-label={`Credit pack ${pack.name}`} className="lgt-card lgt-card--compact space-y-3">
              <div>
                <h4 className="text-sm font-semibold break-words">{pack.name}</h4>
                <p className="text-xs font-mono text-muted-foreground break-all">{pack.id}</p>
              </div>
              {pack.description && <p className="text-xs text-muted-foreground break-words">{pack.description}</p>}
              <dl className="row layout__split-2 layout--keep-columns">
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Price</dt>
                  <dd className="text-sm font-mono">${dollars.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Credits</dt>
                  <dd className="text-sm font-mono text-primary font-bold">{credits.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">Rate: {rate.toFixed(1)} credits / $1</p>
              <div className="row layout__split-2 layout--keep-columns border-t border-border pt-2">
                <Button size="sm" variant="ghost" className="min-h-11 px-2 text-xs gap-1.5" onClick={() => setEditingPack(pack)}>
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="min-h-11 px-2 text-xs gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setPendingDeactivate(pack)}
                  disabled={deactivateMut.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Deactivate
                </Button>
              </div>
            </article>
          );
        })}
      </div> : <p className="lgt-card lgt-card--compact text-sm text-muted-foreground">No active packs. Create one to start selling credits.</p>}

      {inactivePacks.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground">Deactivated</h3>
          <div className="row layout__split-2">
            {inactivePacks.map((pack) => (
              <article key={pack.id} aria-label={`Deactivated credit pack ${pack.name}`} className="lgt-card lgt-card--compact space-y-3">
                <div>
                  <h4 className="text-sm font-semibold break-words">{pack.name}</h4>
                  <p className="text-xs font-mono text-muted-foreground break-all">{pack.id}</p>
                </div>
                <Button
                  size="sm" variant="outline" className="min-h-11 w-full text-xs gap-1.5"
                  onClick={() => reactivateMut.mutate(pack.id)}
                  disabled={reactivateMut.isPending}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reactivate
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      {editingPack && (
        <CreditPackDialog
          mode="edit"
          pack={editingPack}
          bounds={data.bounds}
          onClose={() => setEditingPack(null)}
        />
      )}
      {creating && (
        <CreditPackDialog
          mode="create"
          bounds={data.bounds}
          onClose={() => setCreating(false)}
        />
      )}

      {pendingDeactivate && (
        <Dialog open onOpenChange={(o) => { if (!o) setPendingDeactivate(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate Credit Pack</DialogTitle>
              <DialogDescription>
                Deactivating <span className="font-semibold text-foreground">{pendingDeactivate.name}</span> will remove it from the customer-facing Billing page immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingDeactivate(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deactivateMut.isPending}
                onClick={() => {
                  deactivateMut.mutate(pendingDeactivate.id, {
                    onSettled: () => setPendingDeactivate(null),
                  });
                }}
              >
                {deactivateMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Deactivate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function CreditPackDialog({
  mode,
  pack,
  bounds,
  onClose,
}: {
  mode: "create" | "edit";
  pack?: AdminCreditPack;
  bounds: CreditPackBounds;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [id, setId] = useState(pack?.id ?? "");
  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [dollars, setDollars] = useState(pack ? String((pack.prices[0]?.unit_amount ?? 0) / 100) : "");
  const [credits, setCredits] = useState(pack ? pack.metadata.creditAmount : "");

  const minDollars = bounds.MIN_UNIT_AMOUNT_CENTS / 100;
  const maxDollars = bounds.MAX_UNIT_AMOUNT_CENTS / 100;

  const saveMut = useMutation({
    mutationFn: async () => {
      const unitAmountCents = Math.round(Number(dollars) * 100);
      const creditAmount = Number(credits);
      if (mode === "create") {
        await createCreditPack({ id, name, description, unitAmountCents, creditAmount });
      } else {
        await updateCreditPack(pack!.id, { name, description, unitAmountCents, creditAmount });
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Pack created" : "Pack updated");
      qc.invalidateQueries({ queryKey: ["admin-credit-packs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dollarsNum = Number(dollars);
  const creditsNum = Number(credits);
  const idValid = mode === "edit" || /^[a-z0-9_]+$/.test(id);
  const dollarsValid = dollars !== "" && dollarsNum >= minDollars && dollarsNum <= maxDollars;
  const creditsValid =
    credits !== "" && Number.isInteger(creditsNum) && creditsNum >= bounds.MIN_CREDIT_AMOUNT && creditsNum <= bounds.MAX_CREDIT_AMOUNT;
  const canSave = idValid && !!name.trim() && dollarsValid && creditsValid && !saveMut.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New credit pack" : `Edit ${pack?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "The id below is permanent once created."
              : "Price, credits, name, and description can be changed any time. The pack id itself cannot be changed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "create" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pack ID</label>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase())}
                placeholder="e.g. value_pack"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, underscores only. Cannot be changed later.</p>
            </div>
          )}
          {mode === "edit" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pack ID</label>
              <Input value={pack?.id ?? ""} disabled className="font-mono text-sm opacity-60" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Value Pack" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to customers on the Billing page"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Price (USD, ${minDollars.toFixed(2)}–${maxDollars.toFixed(2)})
              </label>
              <Input
                type="number" step="0.01" min={minDollars} max={maxDollars}
                value={dollars} onChange={(e) => setDollars(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Credits ({bounds.MIN_CREDIT_AMOUNT}–{bounds.MAX_CREDIT_AMOUNT.toLocaleString()})
              </label>
              <Input
                type="number" step="1" min={bounds.MIN_CREDIT_AMOUNT} max={bounds.MAX_CREDIT_AMOUNT}
                value={credits} onChange={(e) => setCredits(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {dollarsValid && creditsValid && (
            <p className="text-xs text-muted-foreground">
              Rate: <span className="font-mono text-primary">{(creditsNum / dollarsNum).toFixed(1)} credits/$</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "create" ? "Create pack" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
