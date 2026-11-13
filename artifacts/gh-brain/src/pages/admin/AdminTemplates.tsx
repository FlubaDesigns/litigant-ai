import { TemplateEditModal } from "./TemplateEditModal";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { listAdminTemplates, updateAdminTemplate } from "@/services/adminService";
import { LoadError, TabSkeleton } from "./AdminShared";

export function TemplatesTab() {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const { data: templates, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-templates"],
    queryFn: listAdminTemplates,
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAdminTemplate(id, { isActive }),
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? "Template activated" : "Template deactivated");
      qc.invalidateQueries({ queryKey: ["admin-templates"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <TabSkeleton />;
  if (isError) return <LoadError onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <div className="admin-row flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edit the shared template catalogue used by the session page and AI engine.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {templates?.length === 0 ? (
        <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
          No templates are available.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {(templates ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/10">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{t.title ?? t.id}</p>
                <p className="text-xs text-muted-foreground truncate">{t.description ?? "—"}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.category}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${t.title ?? t.id}`} onClick={() => setEditTarget(t)}>
                  <Edit3 className="w-3.5 h-3.5" />
                </Button>
                <Switch
                  checked={t.isActive !== false}
                  onCheckedChange={(v) => toggleActive({ id: t.id, isActive: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <TemplateEditModal
          template={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["admin-templates"] });
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
