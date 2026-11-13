import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Trash2, RotateCcw as ResetIcon, Pencil, Eye, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { getAdminBillingDefaults, saveAdminBillingDefaults, getEmailTemplates, updateEmailTemplate, fetchEmailTemplatePreview, getEmailDeliveries, sendReengagementCampaign, getEmailTemplateVersions, saveEmailTemplateVersion, activateEmailTemplateVersion, deleteEmailTemplateVersion, type EmailTemplate, type EmailTemplateVersion, type BillingDefaults } from "@/services/adminService";
import { LoadError, TabSkeleton } from "./AdminShared";

export function VersionRow({
  version, templateId, onActivated, onDeleted,
}: { version: EmailTemplateVersion; templateId: string; onActivated: () => void; onDeleted: () => void }) {
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{version.versionName}</p>
        <p className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleDateString()}</p>
      </div>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:text-primary gap-1" disabled={activating}
        onClick={async () => {
          setActivating(true);
          try { await activateEmailTemplateVersion(templateId, version.id); toast.success(`"${version.versionName}" is now active.`); onActivated(); }
          catch (e: any) { toast.error(e.message); } finally { setActivating(false); }
        }}>
        {activating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Activate
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" disabled={deleting}
        onClick={async () => {
          setDeleting(true);
          try { await deleteEmailTemplateVersion(templateId, version.id); onDeleted(); }
          catch (e: any) { toast.error(e.message); } finally { setDeleting(false); }
        }}>
        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
      </Button>
    </div>
  );
}

export function EmailEditPanel({ template, onSaved }: { template: EmailTemplate; onSaved: () => void }) {
  const [form, setForm] = useState({
    subject:   template.subject   ?? template.defaultSubject,
    headline:  template.headline  ?? template.defaultHeadline,
    introText: template.introText ?? template.defaultIntroText,
  });
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [versionName, setVersionName] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);

  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ["email-template-versions", template.id],
    queryFn: () => getEmailTemplateVersions(template.id),
  } as any);
  const versions: EmailTemplateVersion[] = (versionsData as any) ?? [];

  const handleSave = async () => {
    setSaving(true);
    try { await updateEmailTemplate(template.id, form); toast.success("Template saved."); onSaved(); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      setPreviewHtml(await fetchEmailTemplatePreview(template.id, form));
    } catch (e: any) { toast.error(e.message); } finally { setPreviewing(false); }
  };

  const handleSaveVersion = async () => {
    if (!versionName.trim()) return;
    setSavingVersion(true);
    try {
      await saveEmailTemplateVersion(template.id, versionName.trim(), form);
      toast.success(`Version "${versionName.trim()}" saved.`);
      setVersionName(""); refetchVersions();
    } catch (e: any) { toast.error(e.message); } finally { setSavingVersion(false); }
  };

  return (
    <>
      <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
        <SheetTitle className="text-base font-semibold">{template.label}</SheetTitle>
        <SheetDescription className="text-xs font-mono text-muted-foreground/70 leading-snug">{template.trigger}</SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Subject line</label>
          <Input aria-label="Email subject" maxLength={200} value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Headline</label>
          <Input aria-label="Email headline" maxLength={200} value={form.headline} onChange={e => setForm(p => ({ ...p, headline: e.target.value }))} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Body text</label>
          <Textarea aria-label="Email body" maxLength={3000} value={form.introText} onChange={e => setForm(p => ({ ...p, introText: e.target.value }))} rows={6} className="text-sm resize-none leading-relaxed" />
          <p className="text-[11px] text-muted-foreground/50">Separate paragraphs with a blank line. Variables below are auto-substituted.</p>
        </div>
        {template.tokens.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Available variables</p>
            <div className="flex flex-wrap gap-1.5">
              {template.tokens.map(t => (
                <code key={t} className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono">{"{" + t + "}"}</code>
              ))}
            </div>
          </div>
        )}
        <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" disabled={previewing} onClick={handlePreview}>
          {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} Preview draft
        </Button>
        {previewHtml && <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Draft preview with sample user data and current credit settings.</p>
          <iframe title="Email draft preview" srcDoc={previewHtml} sandbox="" className="w-full h-[500px] rounded-lg border border-border" />
        </div>}
        <Separator />
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Save as version
          </p>
          <div className="flex gap-2">
            <Input placeholder="e.g. Launch copy, A/B test v2…" value={versionName} onChange={e => setVersionName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveVersion(); }} className="h-8 text-sm" />
            <Button size="sm" variant="outline" className="h-8 shrink-0 px-4" disabled={!versionName.trim() || savingVersion} onClick={handleSaveVersion}>
              {savingVersion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
        {versions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Saved versions</p>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {versions.map(v => (
                <VersionRow key={v.id} version={v} templateId={template.id}
                  onActivated={() => { refetchVersions(); onSaved(); setForm({ subject: v.subject, headline: v.headline, introText: v.introText }); }}
                  onDeleted={refetchVersions} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 p-6 border-t border-border flex gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Save changes
        </Button>
        <Button variant="outline" size="sm" title="Reset to system defaults"
          onClick={() => setForm({ subject: template.defaultSubject, headline: template.defaultHeadline, introText: template.defaultIntroText })}>
          <ResetIcon className="w-3.5 h-3.5" />
        </Button>
      </div>
    </>
  );
}

export function EmailRow({ template, onEdit, onToggle }: { template: EmailTemplate; onEdit: () => void; onToggle: (v: boolean) => void }) {
  return (
    <div className="admin-row px-5 py-4 flex items-center gap-4">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{template.label}</p>
          {template.enabled
            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />live</span>
            : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">off</span>}
          {(template.subject || template.headline || template.introText) &&
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">custom</span>}
        </div>
        <p className="text-xs text-muted-foreground/60 font-mono truncate">{template.trigger}</p>
      </div>
      {template.canDisable && <Switch checked={template.enabled} onCheckedChange={onToggle} className="shrink-0" />}
      <Button variant="outline" size="sm" className="shrink-0 h-7 px-3 text-xs gap-1.5" onClick={onEdit}>
        <Pencil className="w-3 h-3" /> Edit
      </Button>
    </div>
  );
}

export function EmailActivity() {
  const history = useQuery({queryKey: ["admin-email-deliveries"], queryFn: getEmailDeliveries});
  return <details className="lgt-card lgt-card--compact">
    <summary className="min-h-11 cursor-pointer py-3">Recent email attempts</summary>
    <Button variant="outline" onClick={() => history.refetch()}>Refresh email history</Button>
    {history.isLoading ? <p role="status">Loading…</p> : history.isError ? <LoadError onRetry={history.refetch} /> :
      <div className="space-y-3 pt-3">{history.data?.map(item => <div key={item.id} className="border-t border-border pt-3 text-sm">
        <p>{item.templateId} · {item.status === "accepted" ? "Accepted by email provider" : item.status}</p>
        <p className="text-xs text-muted-foreground break-all">{item.userId} · {new Date(item.updatedAt).toLocaleString()}</p>
      </div>)}{!history.data?.length && <p>No tracked email attempts yet.</p>}</div>}
  </details>;
}

export function EmailsTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [edited, setEdited] = useState<Partial<BillingDefaults>>({});

  const { data: templates, isLoading: templatesLoading, isError: templatesError, refetch: refetchTemplates } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: getEmailTemplates,
  } as any);

  const { data: defaults, isLoading: defaultsLoading, isError: defaultsError, refetch: refetchDefaults } = useQuery({
    queryKey: ["admin-billing-defaults"],
    queryFn: getAdminBillingDefaults,
  } as any);

  const { mutate: saveDefs, isPending } = useMutation({
    mutationFn: (updates: Partial<BillingDefaults>) => saveAdminBillingDefaults(updates),
    onSuccess: () => {
      toast.success("Threshold saved.");
      setEdited({});
      qc.invalidateQueries({ queryKey: ["admin-billing-defaults"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const campaign = useMutation({mutationFn: sendReengagementCampaign,
    onSuccess: result => { toast.success(`${result.emailsSent} emails accepted; ${result.skipped} skipped; ${result.failed} failed.`); void qc.invalidateQueries({queryKey: ["admin-email-deliveries"]}); },
    onError: (error: Error) => toast.error(error.message),
  });

  const current = defaults ? { ...defaults, ...edited } : null;

  const allTemplates: EmailTemplate[] = (templates as any) ?? [];
  const editingTemplate = allTemplates.find(t => t.id === editingId) ?? null;

  if (templatesLoading || defaultsLoading) return <TabSkeleton />;
  if (templatesError || defaultsError || !current) return <LoadError onRetry={() => Promise.all([refetchTemplates(), refetchDefaults()])} />;

  const liveCount = allTemplates.filter(t => t.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold">Automated Email System</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {liveCount} of {allTemplates.length} emails active &middot; sent via{" "}
          <code className="bg-secondary px-1 rounded text-xs">Resend</code> &middot;{" "}
          <code className="bg-secondary px-1 rounded text-xs">send.litigant-ai.com</code>.
          Click <strong>Edit</strong> on any email to customise its subject, headline, and body — or save and switch between named versions.
        </p>
      </div>

      <div className="lgt-card lgt-card--compact space-y-3">
        <h3 className="font-semibold">Re-engagement</h3>
        <p className="text-sm text-muted-foreground">Manually email registered users with credits who have been inactive for 14 days.</p>
        <Button disabled={campaign.isPending || !allTemplates.find(t => t.id === "reengagement")?.enabled} onClick={() => campaign.mutate()}>
          {campaign.isPending ? "Sending…" : "Send re-engagement emails"}
        </Button>
      </div>
      <EmailActivity />
      {/* Email list */}
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        <div className="px-5 py-3 bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Emails</p>
          <p className="text-xs text-muted-foreground">{liveCount} / {allTemplates.length} active</p>
        </div>
        {allTemplates.map(template => (
          <EmailRow
            key={template.id}
            template={template}
            onEdit={() => { setEditingId(template.id); setSheetOpen(true); }}
            onToggle={(enabled) => {
              qc.setQueryData(["admin-email-templates"], (old: any) =>
                Array.isArray(old) ? old.map((t: EmailTemplate) => t.id === template.id ? { ...t, enabled } : t) : old
              );
              updateEmailTemplate(template.id, { enabled })
                .then(() => qc.invalidateQueries({ queryKey: ["admin-email-templates"] }))
                .catch((e: Error) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ["admin-email-templates"] }); });
            }}
          />
        ))}
      </div>

      {/* Credit alert threshold */}
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        <div className="px-5 py-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credit Alert Threshold</p>
        </div>
        <div className="admin-row flex items-center justify-between px-5 py-4 gap-6">
          <div className="space-y-0.5 flex-1">
            <p className="text-sm font-medium">Send low-credits warning when balance falls below</p>
            <p className="text-xs text-muted-foreground">
              Fires at most once per 24 hours per user. Set to 0 to disable the low-credits email entirely.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number" min={0} max={10000}
              value={current.emailCreditWarningThreshold}
              onChange={(e) => setEdited(prev => ({ ...prev, emailCreditWarningThreshold: parseInt(e.target.value) || 0 }))}
              className="w-24 h-8 rounded-lg border border-border/60 bg-background px-3 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">credits</span>
          </div>
        </div>
      </div>

      <Button
        onClick={() => saveDefs(edited)}
        disabled={isPending || Object.keys(edited).length === 0}
        size="sm"
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        {isPending ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Saving…</> : "Save threshold"}
      </Button>

      {/* Edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) setEditingId(null); }}>
        <SheetContent data-admin-panel="" className="w-full sm:max-w-[540px] flex flex-col gap-0 p-0 overflow-hidden">
          {editingTemplate && (
            <EmailEditPanel
              template={editingTemplate}
              onSaved={() => qc.invalidateQueries({ queryKey: ["admin-email-templates"] })}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
