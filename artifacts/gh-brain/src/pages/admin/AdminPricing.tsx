import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Check, Edit3, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getPricingConfig, updateModelMultiplier, resetModelMultiplier, type PricingModel } from "@/services/adminService";
import { formatDateTime, TabSkeleton } from "./AdminShared";
import { fmtRate, ModelRateDetails, CONNECTION_LABELS } from "./AdminModelProviders";

export function MultiplierCell({ row }: { row: PricingModel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.effectiveMultiplier));
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: () => updateModelMultiplier(row.model, Number(draft)),
    onSuccess: () => {
      toast.success(`${row.label} → ${draft}× saved`);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => resetModelMultiplier(row.model),
    onSuccess: () => {
      toast.success(`${row.label} reset to default (${row.defaultMultiplier}×)`);
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = draft.trim() !== "" && Number.isFinite(Number(draft)) && Number(draft) >= 1 && Number(draft) <= 100;
  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`${row.label} multiplier`}
          type="number" min={1} max={100} step="any" inputMode="decimal"
          value={draft} disabled={saveMut.isPending}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[44px] w-24 font-mono"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !saveMut.isPending) saveMut.mutate();
            if (e.key === "Escape" && !saveMut.isPending) setEditing(false);
          }}
        />
        <Button className="min-h-[44px]" onClick={() => saveMut.mutate()} disabled={!valid || saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" className="min-h-[44px]" disabled={saveMut.isPending} onClick={() => setEditing(false)}>Cancel</Button>
        {!valid && <p className="w-full text-xs text-destructive">Enter a number from 1 to 100.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn("text-sm font-mono font-bold", row.isOverridden ? "text-primary" : "text-foreground")}>
        {row.effectiveMultiplier}×
      </span>
      {row.isOverridden && (
        <span className="text-xs text-muted-foreground">(default: {row.defaultMultiplier}×)</span>
      )}
      <button disabled={resetMut.isPending} onClick={() => { setDraft(String(row.effectiveMultiplier)); setEditing(true); }}
        className="ml-1 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground opacity-70 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        aria-label={`Edit multiplier for ${row.model}`}>
        <Edit3 className="w-3.5 h-3.5" />
      </button>
      {row.isOverridden && (
        <button onClick={() => resetMut.mutate()} disabled={resetMut.isPending}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground opacity-70 hover:text-amber-400 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          aria-label={`Reset ${row.model} multiplier to default`}>
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function PricingTab() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: getPricingConfig,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>Unable to load current pricing. <Button variant="ghost" disabled={isFetching} onClick={() => refetch()}>Retry</Button></div>
      </div>
    );
  }

  const byProvider = [...new Set(data.models.map(m => m.provider))].map((p) => ({
    provider: p,
    models: data.models.filter((m) => m.provider === p),
  })).filter((g) => g.models.length > 0);

  const totalModels = data.models.length;
  const overriddenCount = data.models.filter((m) => m.isOverridden).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{totalModels} models · {overriddenCount} custom multipliers · ${data.creditValueUsd.toFixed(2)}/credit</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={cn("w-4 h-4 mr-1", isFetching && "animate-spin")} />
          {isFetching ? "Checking…" : "Check connections"}
        </Button>
      </div>

      {!totalModels && <div role="status" className="lgt-card lgt-card--compact space-y-3">
        <p className="font-medium text-amber-400">Pricing is blocked by provider connections.</p>
        <p className="text-sm text-muted-foreground">No verified models are available. Review the status below, then update the affected key or check again.</p>
        <div className="row layout__split-2">
          <Button variant="outline" onClick={() => navigate("/admin?tab=api-keys")}>API Keys</Button>
          <Button variant="outline" onClick={() => navigate("/admin?tab=ai-studio")}>AI Studio</Button>
        </div>
      </div>}

      {!!data.providers?.length && <div className="lgt-card lgt-card--compact divide-y divide-border" aria-label="Provider connections">
        {data.providers.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span>{p.label}{!p.enabled && <span className="text-muted-foreground"> · Disabled</span>}</span>
          <span role="status" className={cn("text-xs", p.connection.state === "connected" ? "text-green-400" : "text-destructive")} title={`Checked ${formatDateTime(p.connection.checkedAt)}`}>
            {isFetching ? "Checking…" : p.connection.state === "connected" && !p.modelCount ? "Connected · No supported models" : CONNECTION_LABELS[p.connection.state]}
          </span>
        </div>)}
      </div>}

      <details className="lgt-card lgt-card--compact text-sm text-muted-foreground">
        <summary className="cursor-pointer py-2 font-medium text-foreground">How pricing works</summary>
        <p className="pt-2">Credits = API cost × your multiplier ÷ ${data.creditValueUsd.toFixed(2)}, rounded up after combining all calls. Rates are USD per million tokens; cached input and long-context rates apply where listed. Changes apply to new sessions. Active sessions keep their agreed pricing. Examples use 3 litigants, 2 rounds and balanced responses.</p>
      </details>

      {byProvider.map(({ provider, models }) => (
        <div key={provider} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{models[0]?.providerLabel ?? provider}</h3>
          <div className="row layout__split-2">
            {models.map((m) => (
              <article key={m.model} aria-label={`Pricing for ${m.label}`} className="lgt-card lgt-card--compact space-y-3">
                <div>
                  <h4 className="text-sm font-semibold break-words">
                    {m.label}
                    {m.isOverridden && <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/20">custom</Badge>}
                  </h4>
                  {m.available === false && <p className="text-xs text-muted-foreground">Disabled for new sessions</p>}
                </div>
                <dl className="space-y-3">
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">API Input /1M</dt>
                      <dd className="text-sm font-mono break-words">{fmtRate(m.inputRatePer1k)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">API Output /1M</dt>
                      <dd className="text-sm font-mono break-words">{fmtRate(m.outputRatePer1k)}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Your Multiplier</dt>
                    <dd><MultiplierCell row={m} /></dd>
                  </div>
                  <div className="row layout__split-2 layout--keep-columns">
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Example Credits</dt>
                      <dd className="text-sm font-mono font-bold text-primary break-words">{m.exampleCredits}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Example Cost to User</dt>
                      <dd className="text-sm font-mono break-words">${(m.exampleCredits * data.creditValueUsd).toFixed(2)}</dd>
                    </div>
                  </div>
                </dl>
                <details className="text-xs text-muted-foreground break-words">
                  <summary className="min-h-11 py-3 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Rate details</summary>
                  <ModelRateDetails pricing={m.pricing} />
                </details>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
