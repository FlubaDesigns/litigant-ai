import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { TemplateInputFieldsSchema, type Template, type TemplateInputField } from "@workspace/api-zod/templates";
import { CourtConfigSchema, OUTPUT_MODES, DOCUMENT_TYPES, DOWNLOAD_FORMATS, ANSWER_STYLES, RESPONSE_VIEWS, type CourtConfig } from "@workspace/api-zod/session";
import { updateAdminTemplate } from "@/services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export function TemplateEditModal({template, onClose, onSuccess}: {
  template: Template & {isActive?: boolean}; onClose: () => void; onSuccess: () => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description);
  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt);
  const [isActive, setIsActive] = useState(template.isActive !== false);
  const [inputFields, setInputFields] = useState<TemplateInputField[]>(template.inputFields);
  const [defaultConfig, setDefaultConfig] = useState<CourtConfig>(template.defaultConfig);
  const save = useMutation({mutationFn: async () => {
    const fields = TemplateInputFieldsSchema.safeParse(inputFields);
    if (!fields.success) throw new Error("Give each question a label and a unique ID (maximum 30).");
    if (!title.trim()) throw new Error("Enter a template title.");
    await updateAdminTemplate(template.id, {title, description, systemPrompt, isActive, inputFields: fields.data, defaultConfig: CourtConfigSchema.parse(defaultConfig)});
  }, onSuccess: () => {toast.success("Template updated"); onSuccess();}, onError: (error: Error) => toast.error(error.message)});
  function updateField(index: number, changes: Partial<TemplateInputField>) {
    setInputFields(fields => fields.map((field, i) => i === index ? {...field, ...changes} : field));
  }
  function moveField(index: number, direction: number) {
    setInputFields(fields => { const next = [...fields]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; return next; });
  }
  function changeConfig(changes: Partial<CourtConfig>) {
    setDefaultConfig(config => CourtConfigSchema.parse({...config, ...changes}));
  }
  const outputs = [
    {key: "outputPreferenceMode", label: "Document creation", choices: OUTPUT_MODES},
    {key: "artifactType", label: "Document type", choices: DOCUMENT_TYPES},
    {key: "outputFormat", label: "Answer style", choices: ANSWER_STYLES},
    {key: "outputStrategy", label: "Response view", choices: RESPONSE_VIEWS},
    {key: "format", label: "Download format", choices: DOWNLOAD_FORMATS},
  ] as const;
  return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent data-admin-panel="" className="max-w-lg max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Edit Template</DialogTitle><DialogDescription>{template.id}</DialogDescription></DialogHeader>
      <div className="space-y-4 py-2">
        <label className="block space-y-1"><span>Title</span><Input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="block space-y-1"><span>Description</span><Textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <details open className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">Questions ({inputFields.length})</summary>
          {inputFields.map((field, index) => <fieldset key={field.id} className="border border-border rounded-lg p-3 space-y-3">
            <legend className="text-sm">Question {index + 1}</legend>
            <label className="block space-y-1"><span className="text-sm">Question</span><Input maxLength={300} value={field.label} onChange={e => updateField(index, {label: e.target.value})} /></label>
            <label className="block space-y-1"><span className="text-sm">Hint</span><Textarea maxLength={1000} value={field.placeholder} onChange={e => updateField(index, {placeholder: e.target.value})} /></label>
            <label className="block space-y-1"><span className="text-sm">Answer type</span><select className="w-full min-h-11 rounded border border-input bg-background px-3" value={field.type} onChange={e => updateField(index, {type: e.target.value as TemplateInputField["type"]})}><option value="text">Short answer</option><option value="textarea">Long answer</option><option value="url">Web link</option></select></label>
            <div className="flex items-center gap-3"><Switch aria-label={`Question ${index + 1} required`} checked={field.required} onCheckedChange={required => updateField(index, {required})} /><span className="text-sm">Required</span></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={index === 0} onClick={() => moveField(index, -1)}>Move up</Button><Button variant="outline" disabled={index === inputFields.length - 1} onClick={() => moveField(index, 1)}>Move down</Button><Button variant="ghost" onClick={() => setInputFields(fields => fields.filter((_, i) => i !== index))}>Remove question</Button></div>
          </fieldset>)}
          <Button variant="outline" disabled={inputFields.length >= 30} onClick={() => setInputFields(fields => [...fields, {id: crypto.randomUUID(), label: "", placeholder: "", type: "textarea", required: false}])}>Add question</Button>
        </details>
        <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Deliverable defaults</summary>
          <p className="text-xs text-muted-foreground">Document creation applies to Pro access. Free access remains answer-only.</p>
          {outputs.filter(item => item.key !== "artifactType" || defaultConfig.outputPreferenceMode !== "answer-only").map(item => <label key={item.key} className="block space-y-1"><span className="text-sm">{item.label}</span><select className="w-full min-h-11 rounded border border-input bg-background px-3" value={String(defaultConfig[item.key] ?? "auto")} onChange={e => changeConfig({[item.key]: e.target.value})}>{Object.entries(item.choices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
        </details>
        <label className="block space-y-1"><span>AI instructions</span><Textarea rows={8} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="Leave blank to restore the built-in instructions" /></label>
        <div className="flex items-center gap-3"><Switch aria-label="Template active" checked={isActive} onCheckedChange={setIsActive} /><span>Active</span></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
