import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getChecklist, setChecklistItemChecked, type ChecklistItem } from "@/services/adminService";
import { TabSkeleton } from "./AdminShared";

export function ChecklistRow({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const hasSteps = item.steps && item.steps.length > 0;
  return (
    <div className="divide-y divide-border/50">
      <div className="flex items-start gap-3 p-4 hover:bg-secondary/20 transition-colors">
        <Checkbox
          aria-label={item.text}
          checked={item.checked}
          onCheckedChange={(v) => onToggle(item.id, v === true)}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", item.checked ? "text-muted-foreground line-through" : "text-foreground")}>
            {item.text}
          </p>
          {item.recurring && <Badge variant="outline" className="mt-1 text-xs">Recurring</Badge>}
          {hasSteps && (
            <Accordion type="single" collapsible className="mt-2 -mx-0.5">
              <AccordionItem value="steps" className="border border-border/40 rounded-lg overflow-hidden">
                <AccordionTrigger className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary/70 hover:text-primary hover:no-underline hover:bg-primary/5 transition-colors">
                  Details
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-0">
                  <ol className="flex flex-col divide-y divide-border/30">
                    {item.steps!.map((step, i) => {
                      const isHeader = step.startsWith("──");
                      if (isHeader) return (
                        <li key={i} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary/50 bg-primary/3">
                          {step.replace(/^──\s*/, "").replace(/\s*──$/, "")}
                        </li>
                      );
                      const parts = step.split(/(https?:\/\/[^\s)]+)/g);
                      return (
                        <li key={i} className="px-3 py-2.5 text-xs text-muted-foreground leading-relaxed hover:bg-secondary/20 transition-colors">
                          {parts.map((part, j) =>
                            part.match(/^https?:\/\//) ? (
                              <a key={j} href={part} target="_blank" rel="noopener noreferrer"
                                className="text-primary underline underline-offset-2 hover:text-primary/80 break-all">
                                {part}
                              </a>
                            ) : part
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChecklistSection({
  title, items, onToggle,
}: {
  title: string;
  items: ChecklistItem[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <Badge variant="outline" className="font-mono text-xs">{items.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

export function ChecklistTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-checklist"],
    queryFn: getChecklist,
    retry: false,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) => setChecklistItemChecked(id, checked),
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: ["admin-checklist"] });
      const prev = qc.getQueryData<ChecklistItem[]>(["admin-checklist"]);
      qc.setQueryData<ChecklistItem[]>(["admin-checklist"], (old) =>
        old?.map((i) => (i.id === id ? { ...i, checked } : i)) ?? old
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin-checklist"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-checklist"] }),
  });

  if (isLoading) return <TabSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Could not load checklist — try refreshing the page.
      </div>
    );
  }

  const visibleItems = data.filter((item) => !item.checked || item.recurring);
  const agentItems = visibleItems.filter((i) => i.section === "agent");
  const ownerItems = visibleItems.filter((i) => i.section === "owner");

  return (
    <div className="space-y-6">
      {visibleItems.length === 0 && <p className="text-sm text-muted-foreground">Nothing left to do.</p>}

      <ChecklistSection
        title="Your action items"
        items={ownerItems}
        onToggle={(id, checked) => toggleMut.mutate({ id, checked })}
      />

      <ChecklistSection
        title="Agent work items"
        items={agentItems}
        onToggle={(id, checked) => toggleMut.mutate({ id, checked })}
      />
    </div>
  );
}
