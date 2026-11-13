import { SeatEvaluationPanel } from "./SeatEvaluationPanel";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Check, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateModelMultiplier, getAiStudioModels, setAiStudioPower, toggleAiStudioModel, toggleAiStudioProvider, deleteAiStudioProvider, setModelQualityScore, type AiStudioData } from "@/services/adminService";
import { TabSkeleton } from "./AdminShared";
import { AddProviderModal, AiStudioProviderSection } from "./AdminModelProviders";

export function AiStudioTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [openProvider, setOpenProvider] = useState<string | null>("openai");

  const { data, isLoading, isError, isFetching, refetch } = useQuery<AiStudioData>({
    queryKey: ["admin-ai-studio"],
    queryFn: getAiStudioModels,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const powerMut = useMutation({
    mutationFn: setAiStudioPower,
    onSuccess: ({ aiEnabled }) => {
      qc.setQueryData<AiStudioData>(["admin-ai-studio"], old => old ? { ...old, aiEnabled } : old);
      for (const queryKey of [["admin-ai-studio"], ["admin-pricing"], ["configuration", "providers"]]) {
        qc.invalidateQueries({ queryKey });
      }
      toast.success(aiEnabled ? "AI switched on" : "All AI switched off");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleModelMut = useMutation({
    mutationFn: ({ modelId, enabled }: { modelId: string; enabled: boolean }) =>
      toggleAiStudioModel(modelId, enabled),
    onSuccess: (_d, { modelId, enabled }) => {
      toast.success(`${modelId} ${enabled ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleProviderMut = useMutation({
    mutationFn: ({ providerId, enabled }: { providerId: string; enabled: boolean }) =>
      toggleAiStudioProvider(providerId, enabled),
    onSuccess: (_d, { providerId, enabled }) => {
      toast.success(`${providerId} ${enabled ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteProviderMut = useMutation({
    mutationFn: (providerId: string) => deleteAiStudioProvider(providerId),
    onSuccess: (_d, providerId) => {
      toast.success(`Provider "${providerId}" deleted`);
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scoreModelMut = useMutation({
    mutationFn: ({ modelId, score }: { modelId: string; score: number }) =>
      setModelQualityScore(modelId, score),
    onSuccess: async (_d, { modelId, score }) => {
      // Keep editing locked until the saved catalog is visible. A second edit
      // must not race the refresh from the first save.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-ai-studio"] }),
        qc.invalidateQueries({ queryKey: ["admin-pricing"] }),
      ]);
      toast.success(`${modelId} Selection score set to ${score}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const multiplierMut = useMutation({
    mutationFn: ({ modelId, multiplier }: { modelId: string; multiplier: number }) => updateModelMultiplier(modelId, multiplier),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-ai-studio"] }),
        qc.invalidateQueries({ queryKey: ["admin-pricing"] }),
      ]);
      toast.success("Markup saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Connection checks unavailable.
        <button onClick={() => refetch()} className="ml-auto text-xs underline">Retry</button>
      </div>
    );
  }

  const { models = [], providers = [], aiEnabled = true } = data;
  const busy = powerMut.isPending || toggleModelMut.isPending || toggleProviderMut.isPending || deleteProviderMut.isPending || scoreModelMut.isPending || multiplierMut.isPending;
  const enabledCount = aiEnabled ? models.filter(m => m.available).length : 0;
  const byProvider = providers.map(provider => ({...provider, models:models.filter(m => m.provider === provider.id)}));

  return (
    <div className="space-y-6">
      <SeatEvaluationPanel />
      <p className="text-sm text-muted-foreground">Selection scores are configurable routing preferences, not measured IQ or answer-accuracy probabilities.</p>
      <section aria-label="AI master power" className="lgt-card lgt-card--compact flex items-center justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="ai-master-power" className="text-lg font-semibold cursor-pointer">All AI — {aiEnabled ? "ON" : "OFF"}</label>
          <p className="text-sm text-muted-foreground">{aiEnabled ? "Your selected providers are enabled." : "AI calls are off. Your selections are saved."}</p>
          {!aiEnabled && <p className="text-xs text-muted-foreground">A request already sent may finish.</p>}
        </div>
        <Switch id="ai-master-power" aria-label="All AI" checked={aiEnabled}
          onCheckedChange={enabled => powerMut.mutate(enabled)} disabled={busy}
          className="studio-master-switch" />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{models.length} verified models · {enabledCount} enabled</p>
        <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isFetching}><RefreshCw className={cn("w-4 h-4 mr-1",isFetching && "animate-spin")} />Check connection</Button>
        <Button onClick={() => setAddOpen(true)} variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />Add Provider</Button>
      </div>

      {!providers.length && <p className="text-sm text-muted-foreground">No connected providers. <a className="text-primary underline" href="/admin?tab=api-keys">API Keys</a></p>}
      {byProvider.map(({ id: pid, label, models: provModels, custom, enabled: provEnabled, connection, discoveredModels, pricingUrl }) => (
        <AiStudioProviderSection
          key={pid}
          id={pid}
          label={label}
          provModels={provModels}
          connection={connection}
          discoveredModels={discoveredModels}
          pricingUrl={pricingUrl}
          checking={isFetching}
          providerEnabled={aiEnabled && provEnabled}
          custom={custom}
          open={openProvider === pid}
          onOpen={() => setOpenProvider(openProvider === pid ? null : pid)}
          onSetMultiplier={(modelId, multiplier) => multiplierMut.mutate({ modelId, multiplier })}
          busy={busy || !aiEnabled}
          onToggleProvider={(en) => toggleProviderMut.mutate({ providerId: pid, enabled: en })}
          onToggleModel={(modelId, en) => toggleModelMut.mutate({ modelId, enabled: en })}
          onSetScore={(modelId, score) => scoreModelMut.mutate({ modelId, score })}
          onDelete={() => deleteProviderMut.mutate(pid)}
        />
      ))}

      <AddProviderModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-ai-studio"] }); qc.invalidateQueries({ queryKey: ["admin-pricing"] }); }}
      />
    </div>
  );
}
