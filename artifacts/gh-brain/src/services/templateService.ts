import { normalizeTemplate, type Template } from "@workspace/api-zod/templates";
import { API_BASE } from "@/lib/apiUrl";
export async function fetchTemplates(): Promise<Template[]> {
  const response = await fetch(`${API_BASE}/templates`, {cache:"no-store"});
  if (!response.ok) throw new Error("Unable to load templates");
  const data = await response.json();
  const items: unknown[] = Array.isArray(data) ? data : data.templates ?? [];
  return items.map(value => normalizeTemplate(value)).filter((t): t is Template => !!t);
}
