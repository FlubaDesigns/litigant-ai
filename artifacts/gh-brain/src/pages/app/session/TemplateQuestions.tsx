import type { TemplateInputField } from "@workspace/api-zod/templates";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** The same short intake works on a phone and desktop; details stay optional. */
export function TemplateQuestions({ fields, values, onChange, onRun }: {
  fields: TemplateInputField[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onRun: () => void;
}) {
  const renderField = (field: TemplateInputField) => {
    const props = {
      id: `template-${field.id}`,
      placeholder: field.placeholder,
      value: values[field.id] ?? "",
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field.id, event.target.value),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onRun(); }
      },
      "aria-required": field.required,
      className: "text-sm w-full focus-visible:ring-1 focus-visible:ring-primary/60",
      style: { background: "#0d1a0d", border: "1px solid #1d331d", color: "#eef7ee" },
    };
    return <div key={field.id} className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={props.id} className="text-xs text-primary/80 font-medium">{field.label}{field.required ? " *" : ""}</label>
      {field.type === "textarea" ? <Textarea {...props} rows={3} /> : <Input {...props} type={field.type} />}
    </div>;
  };
  const optional = fields.filter(field => !field.required);
  return <div className="space-y-3" data-testid="template-questions">
    <p className="text-xs text-muted-foreground">Start with what you know. “I don’t know” is okay. The court can ask follow-up questions before continuing.</p>
    {fields.filter(field => field.required).map(renderField)}
    {optional.length > 0 && <details className="rounded-lg border border-primary/20 p-3">
      <summary className="text-sm text-primary/80 cursor-pointer min-h-8">Optional details ({optional.length})</summary>
      <div className="space-y-3 pt-2">{optional.map(renderField)}</div>
    </details>}
  </div>;
}
