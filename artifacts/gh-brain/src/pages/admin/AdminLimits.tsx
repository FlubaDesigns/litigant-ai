import { ADMIN_LIMIT_RANGES } from "@workspace/api-zod/limits";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAdminLimits, setAdminLimit, getAdminBillingDefaults, saveAdminBillingDefaults, type BillingDefaults } from "@/services/adminService";
import { TabSkeleton } from "./AdminShared";
import { ConversationAverage } from "./AdminOverview";

export const LIMIT_DESCRIPTIONS: Record<string, { label: string; description: string; min: number; max: number }> = {
  feedbackPerHour: { label: "Feedback per hour", description: "Maximum submissions per signed-in account.", ...ADMIN_LIMIT_RANGES.feedbackPerHour },
  caseFilesPerHour: { label: "Documents per hour", description: "Combined upload and URL requests per signed-in account.", ...ADMIN_LIMIT_RANGES.caseFilesPerHour },
  extractionTimeoutSeconds: { label: "Document processing timeout", description: "Seconds before a document worker is stopped.", ...ADMIN_LIMIT_RANGES.extractionTimeoutSeconds },
  overdraftLimit: {
    label: "Courtesy ceiling",
    description: "Paying members only. Repay before next run.",
    ...ADMIN_LIMIT_RANGES.overdraftLimit,
  },
  maxLitigants: {
    label: "Maximum litigants",
    description: "AI debaters per session.",
    ...ADMIN_LIMIT_RANGES.maxLitigants,
  },
};

export function LimitsTab() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: settings, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-limits"],
    queryFn: getAdminLimits,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: ({ name, value }: { name: string; value: number }) => setAdminLimit(name, value),
    onSuccess: (_, { name, value }) => {
      toast.success(`${LIMIT_DESCRIPTIONS[name].label} saved.`);
      setDrafts(prev => { const next = {...prev}; delete next[name]; return next; });
      qc.invalidateQueries({ queryKey: ["admin-limits"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const limits = settings?.limits;
  if (isLoading) return <TabSkeleton />;
  if (isError || !limits) return <div role="alert" className="lgt-card lgt-card--compact space-y-3"><p>Could not load limits.</p><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="admin-row flex items-center justify-between">
          <h3 className="text-sm font-semibold">Session Limits</h3>
          <Button variant="outline" size="icon" aria-label="Refresh limits" title="Refresh limits" className="min-h-11 min-w-11 shrink-0" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="row layout__split-2">
          {Object.entries(LIMIT_DESCRIPTIONS).map(([name, meta]) => {
            const current = limits[name as keyof typeof limits];
            return (
              <article key={name} aria-label={meta.label} className="lgt-card lgt-card--compact space-y-2">
                <div className="flex-1 space-y-0.5 min-w-0">
                  <p className="font-medium text-sm">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.min}–{meta.max.toLocaleString()}{name === "overdraftLimit" ? " credits" : " AI debaters per session"}</p>
                </div>
                <form className="row layout__split-2 layout--keep-columns items-center" onSubmit={event => { event.preventDefault(); save({name, value:Number(drafts[name] ?? current)}); }}>
                  <input aria-label={meta.label} type="number" min={meta.min} max={meta.max} step={1} required disabled={isPending} value={drafts[name] ?? current} onChange={event => setDrafts(prev => ({...prev,[name]:event.target.value}))} className="min-h-11 min-w-0 w-full rounded border border-border bg-background px-3 text-sm font-mono" />
                  <Button type="submit" variant="outline" className="min-h-11 w-full" disabled={isPending || drafts[name] === undefined || Number(drafts[name]) === current}>Save</Button>
                </form>
                {name === "overdraftLimit" && <p className="text-xs text-muted-foreground">{meta.description}</p>}
              </article>
            );
          })}
        </div>
      </div>

      <ConversationAverage />
      <BillingDefaultsSection />
    </div>
  );
}

export const BILLING_FIELDS = [
  { key: "defaultAutoRefillAmount", label: "Default charge", unit: "USD", min: 1, max: 500, description: "Starting top-up amount for users without a saved preference." },
  { key: "defaultThresholdCredits", label: "Top-up trigger", unit: "credits", min: 0, max: 100000, description: "Opens checkout below this balance when the user enables top-up." },
  { key: "defaultWarningThresholdCredits", label: "Low-balance warning", unit: "credits", min: 0, max: 100000, description: "Starting balance threshold for the warning banner." },
  { key: "signupBonusCredits", label: "Signup bonus", unit: "credits", min: 0, max: 100000, description: "New-account grant, free-trial cards, signup offers and verification emails." },
  { key: "emailCreditWarningThreshold", label: "Email warning", unit: "credits", min: 0, max: 100000, description: "Email below this balance; 0 disables it." },
] as const;

export function BillingDefaultsSection() {
  const qc = useQueryClient();
  const [amountsInput, setAmountsInput] = useState<string | null>(null);
  const [edited, setEdited] = useState<Partial<Record<Exclude<keyof BillingDefaults, "autoRefillAmounts">, string>>>({});
  const { data: defaults, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-billing-defaults"], queryFn: getAdminBillingDefaults,
  });
  const { mutate: saveDefs, isPending } = useMutation({
    mutationFn: saveAdminBillingDefaults,
    onSuccess: (saved) => {
      qc.setQueryData(["admin-billing-defaults"], saved);
      setEdited({}); setAmountsInput(null);
      toast.success("Billing defaults saved.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  if (isLoading) return <TabSkeleton />;
  if (isError || !defaults) return <div role="alert" className="lgt-card lgt-card--compact space-y-3"><p>Could not load billing defaults.</p><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const updates: Partial<BillingDefaults> = {};
    for (const field of BILLING_FIELDS) {
      const value = edited[field.key];
      if (value !== undefined) {
        if (!value.trim() || !Number.isInteger(Number(value))) { toast.error(`${field.label} needs a whole number.`); return; }
        updates[field.key] = Number(value);
      }
    }
    if (amountsInput !== null) {
      const entries = amountsInput.split(",").map(value => value.trim());
      if (entries.some(value => !/^\d+$/.test(value))) { toast.error("Enter whole-dollar amounts separated by commas."); return; }
      updates.autoRefillAmounts = entries.map(Number);
    }
    saveDefs(updates);
  }
  return <form onSubmit={handleSave} className="space-y-4">
    <div><h3 className="text-sm font-semibold">Billing Defaults</h3><p className="text-xs text-muted-foreground mt-1">Signup changes apply to new grants and public offers. Existing balances and saved top-up preferences stay as they are.</p></div>
    <fieldset disabled={isPending} className="row layout__split-2 min-w-0 w-full">
      <div className="lgt-card lgt-card--compact space-y-2">
        <label htmlFor="billing-top-up-amounts" className="block text-sm font-medium">Top-up amounts</label>
        <input id="billing-top-up-amounts" type="text" value={amountsInput ?? defaults.autoRefillAmounts.join(", ")} onChange={event => setAmountsInput(event.target.value)} className="w-full min-h-11 rounded border border-border bg-background px-3 text-sm" />
        <p className="text-xs text-muted-foreground">Quick-pick dollar amounts, separated by commas.</p>
      </div>
      {BILLING_FIELDS.map(field => <div key={field.key} className="lgt-card lgt-card--compact space-y-2">
        <label htmlFor={`billing-${field.key}`} className="block text-sm font-medium">{field.label}</label>
        <div className="flex items-center gap-2">
          <input id={`billing-${field.key}`} type="number" min={field.min} max={field.max} step={1} required value={edited[field.key] ?? defaults[field.key]} onChange={event => setEdited(prev => ({...prev,[field.key]:event.target.value}))} className="w-full min-w-0 min-h-11 rounded border border-border bg-background px-3 text-sm font-mono" />
          <span className="text-xs text-muted-foreground">{field.unit}</span>
        </div>
        <p className="text-xs text-muted-foreground">{field.description}</p>
      </div>)}
    </fieldset>
    <Button type="submit" className="min-h-11" disabled={isPending || (amountsInput === null && Object.keys(edited).length === 0)}>{isPending ? "Saving…" : "Save Billing Defaults"}</Button>
  </form>;
}
