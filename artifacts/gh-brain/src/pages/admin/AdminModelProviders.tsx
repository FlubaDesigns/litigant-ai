import { useState } from "react";
import { Users, ChevronRight, Loader2, AlertTriangle, ChevronDown, Plus, Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { addAiStudioProvider, type AiStudioModel, type AiStudioProvider, type AiStudioCustomModel } from "@/services/adminService";
import { formatDate, formatDateTime } from "./AdminShared";

export function fmtRate(ratePerK: number): string {
  const perM = ratePerK * 1000;
  if (perM < 0.01) return `$${perM.toFixed(4)}/1M`;
  return `$${perM.toFixed(2)}/1M`;
}

export function ModelRateDetails({pricing}: {pricing: AiStudioModel["pricing"]}) {
  return <div className="space-y-1 text-xs text-muted-foreground">
    <p>{pricing?.verifiedAt ? `Verified ${pricing.verifiedAt}` : "Rate unverified"}
      {pricing?.sourceUrl && <> · <a href={pricing.sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline">Source</a></>}
    </p>
    {pricing?.cachedInputPer1k !== undefined && <p>Cached input: {fmtRate(pricing.cachedInputPer1k)}</p>}
    {pricing?.cacheWriteInputPer1k !== undefined && <p>Cache writes: {fmtRate(pricing.cacheWriteInputPer1k)}{pricing.cacheWriteInput1hPer1k !== undefined && ` · 1-hour: ${fmtRate(pricing.cacheWriteInput1hPer1k)}`}</p>}
    {pricing?.longContext && <p>{pricing.longContext.inclusive ? "At or above" : "Above"} {pricing.longContext.threshold.toLocaleString()} input tokens: {fmtRate(pricing.longContext.input)} in · {fmtRate(pricing.longContext.output)} out.</p>}
    {pricing?.note && <p>{pricing.note}</p>}
  </div>;
}

export const EMPTY_MODEL = (): AiStudioCustomModel => ({
  id: "", label: "", inputRatePer1k: 0.003, outputRatePer1k: 0.015, multiplier: 5,
});

export function AddProviderModal({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [idManual, setIdManual] = useState(false);
  const [models, setModels] = useState<AiStudioCustomModel[]>([EMPTY_MODEL()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function toSlug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function handleLabelChange(v: string) {
    setLabel(v);
    if (!idManual) setId(toSlug(v));
  }

  function setModel(i: number, patch: Partial<AiStudioCustomModel>) {
    setModels((ms) => ms.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }

  async function handleSave() {
    setErr("");
    if (!label.trim() || !id.trim()) { setErr("Provider name and ID are required."); return; }
    if (models.some((m) => !m.id.trim() || !m.label.trim())) {
      setErr("Every model needs an ID and a label."); return;
    }
    setSaving(true);
    try {
      await addAiStudioProvider({ id: id.trim(), label: label.trim(), models });
      onSaved();
      onClose();
      setLabel(""); setId(""); setIdManual(false); setModels([EMPTY_MODEL()]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-admin-panel="" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" /> Add Provider
          </DialogTitle>
          <DialogDescription>
            Define a custom AI provider and its models. Users will see these alongside built-in ones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Provider identity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Provider Name</label>
              <Input
                placeholder="e.g. Mistral AI"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Provider ID (slug)</label>
              <Input
                placeholder="e.g. mistral"
                value={id}
                onChange={(e) => { setIdManual(true); setId(toSlug(e.target.value)); }}
              />
            </div>
          </div>

          {/* Models */}
          <div className="space-y-2">
            <div className="admin-row flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Models</p>
              <Button
                size="sm" variant="ghost"
                className="h-6 text-xs gap-1"
                onClick={() => setModels((ms) => [...ms, EMPTY_MODEL()])}
              >
                <Plus className="w-3 h-3" /> Add model
              </Button>
            </div>

            {models.map((m, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-secondary/20">
                <div className="admin-row flex items-center justify-between">
                  <p className="text-xs font-mono text-muted-foreground">Model {i + 1}</p>
                  {models.length > 1 && (
                    <button
                      onClick={() => setModels((ms) => ms.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Model Label</label>
                    <Input
                      placeholder="e.g. Mistral Large"
                      value={m.label}
                      onChange={(e) => setModel(i, { label: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Model ID</label>
                    <Input
                      placeholder="e.g. mistral-large-2411"
                      value={m.id}
                      onChange={(e) => setModel(i, { id: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Input $/1K tokens</label>
                    <Input
                      type="number" step="0.0001" min="0"
                      value={m.inputRatePer1k}
                      onChange={(e) => setModel(i, { inputRatePer1k: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Output $/1K tokens</label>
                    <Input
                      type="number" step="0.0001" min="0"
                      value={m.outputRatePer1k}
                      onChange={(e) => setModel(i, { outputRatePer1k: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Multiplier</label>
                    <Input
                      type="number" step="1" min="1"
                      value={m.multiplier}
                      onChange={(e) => setModel(i, { multiplier: parseInt(e.target.value) || 1 })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {err && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const CONNECTION_LABELS: Record<AiStudioProvider["connection"]["state"], string> = {
  connected:"Connected", key_rejected:"Key rejected", rate_limited:"Rate limited",
  unavailable:"Unavailable", not_configured:"Not configured",
};

export function AiStudioProviderSection({
  id: pid, label, provModels, providerEnabled, custom, open, onOpen, connection, checking,
  onToggleProvider, onToggleModel, onSetScore, onSetMultiplier, onDelete, busy, discoveredModels = [], pricingUrl,
}: {
  id: string; label: string; provModels: AiStudioModel[]; providerEnabled: boolean;
  custom: boolean; open: boolean; onOpen: () => void;
  connection: AiStudioProvider["connection"]; checking: boolean;
  discoveredModels?: AiStudioProvider["discoveredModels"]; pricingUrl?: string;
  onToggleProvider: (enabled: boolean) => void;
  onToggleModel: (modelId: string, enabled: boolean) => void;
  onSetScore: (modelId: string, score: number) => void;
  onSetMultiplier: (modelId: string, multiplier: number) => void;
  onDelete: () => void; busy: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const connected = connection.state === "connected";
  const status = checking ? "Checking…" : CONNECTION_LABELS[connection.state];
  return (
    <section className="lgt-card lgt-card--compact studio-provider" aria-label={label}>
      <div className="studio-heading">
        <button className="studio-disclosure" onClick={onOpen} aria-label={label} aria-expanded={open} aria-controls={`provider-${pid}`}>
          <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", open && "rotate-180")} />
          <span><strong>{label}</strong><span className="text-muted-foreground ml-2 text-xs">{provModels.filter(m => !m.unsupportedReason).length} ready{discoveredModels.length > 0 && ` · ${discoveredModels.length} new`}</span>
            <span role="status" className={cn("block text-xs", checking ? "text-muted-foreground" : connected ? "text-green-400" : "text-destructive")} title={`Checked ${new Date(connection.checkedAt).toLocaleString()}`}>{status}</span>
            <span className="block text-xs text-muted-foreground">Checked {formatDateTime(connection.checkedAt)}</span>
          </span>
        </button>
        <Switch aria-label={`Enable ${label}`} data-connection={checking ? "checking" : connected ? "connected" : "unavailable"} checked={providerEnabled} onCheckedChange={onToggleProvider} disabled={busy} />
      </div>
      {open && <div id={`provider-${pid}`}>
        {!checking && !provModels.length && <p className="text-xs text-muted-foreground py-2">{connected ? (discoveredModels.length ? "New models need pricing before use." : "No supported models available.") : "Connection not verified."} <a className="text-primary underline" href="/admin?tab=api-keys">API Keys</a></p>}
        {provModels.map(m => {
          const expanded = expandedModel === m.id;
          return <div key={m.id} className="studio-model">
            <div className="studio-heading">
              <button className="studio-disclosure" onClick={() => setExpandedModel(expanded ? null : m.id)} aria-expanded={expanded} aria-controls={`model-${m.id}`}>
                <ChevronRight className={cn("w-4 h-4 shrink-0 transition-transform", expanded && "rotate-90")} />
                <span>{m.label}{!m.available && <span className="block text-xs text-muted-foreground">{m.unsupportedReason ?? (!m.enabled || !providerEnabled ? "Disabled" : "Not configured")}</span>}</span>
              </button>
              <Switch aria-label={`Enable ${m.label}`} checked={m.enabled && !m.unsupportedReason} onCheckedChange={checked => onToggleModel(m.id, checked)} disabled={busy || !providerEnabled || !!m.unsupportedReason} />
            </div>
            {expanded && <div id={`model-${m.id}`} className="studio-details space-y-3">
              <div className="row layout__split-2 layout--keep-columns">
                <label className="text-xs text-muted-foreground">Selection score
                  <Input key={`score-${m.qualityScore}`} aria-label={`${m.label} Selection score`} type="number" min={0} max={100} defaultValue={m.qualityScore ?? 50} disabled={busy}
                    onBlur={e => { const v = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(v) && v >= 0 && v <= 100) { if (v !== (m.qualityScore ?? 50)) onSetScore(m.id, v); e.target.value = String(m.qualityScore ?? 50); } else e.target.value = String(m.qualityScore ?? 50); }}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                </label>
                <label className="text-xs text-muted-foreground">Markup ×
                  <Input key={`multiplier-${m.multiplier}`} aria-label={`${m.label} multiplier`} type="number" min={1} max={100} step="0.1" defaultValue={m.multiplier} disabled={busy}
                    onBlur={e => { const v = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(v) && v >= 1 && v <= 100) { if (v !== m.multiplier) onSetMultiplier(m.id, v); e.target.value = String(m.multiplier); } else e.target.value = String(m.multiplier); }}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                </label>
              </div>
              <table className="studio-rates">
                <caption>USD / 1M tokens</caption>
                <thead><tr><th scope="col"></th><th scope="col">API cost</th><th scope="col">User price</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Input</th><td>{fmtRate(m.inputRatePer1k).replace("/1M", "")}</td><td>{fmtRate(m.userInputPer1k).replace("/1M", "")}</td></tr>
                  <tr><th scope="row">Output</th><td>{fmtRate(m.outputRatePer1k).replace("/1M", "")}</td><td>{fmtRate(m.userOutputPer1k).replace("/1M", "")}</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">Example session: {m.exampleCredits} credits</p>
              <ModelRateDetails pricing={m.pricing} />
            </div>}
          </div>;
        })}
        {discoveredModels.length > 0 && <details className="pt-2 text-sm" aria-label={`New ${label} models`}>
          <summary className="cursor-pointer min-h-11 py-3 text-primary">New models · {discoveredModels.length} need pricing</summary>
          <p className="text-xs text-muted-foreground pb-2">Reported by the provider. These stay out of sessions until their pricing and compatibility are verified.</p>
          <ul className="space-y-2">
            {discoveredModels.map(model => <li key={model.id} className="text-xs break-words">
              <span className="font-medium">{model.label}</span>
              {model.label !== model.id && <span className="block text-muted-foreground">{model.id}</span>}
              {model.releasedAt && <span className="block text-muted-foreground">Released {formatDate(model.releasedAt)}</span>}
              <span className="block text-amber-400">Pricing review needed</span>
            </li>)}
          </ul>
          {pricingUrl && <a className="inline-flex items-center min-h-11 text-primary" href={pricingUrl} target="_blank" rel="noopener noreferrer">Provider models &amp; pricing ↗</a>}
        </details>}
        {custom && <div className="flex items-center gap-3 pt-2">
          {confirmDelete ? <><span className="text-xs">Delete provider?</span><Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button></> :
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>Delete provider</Button>}
        </div>}
      </div>}
    </section>
  );
}
