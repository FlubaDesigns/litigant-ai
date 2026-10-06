import { describe, expect, it } from "vitest";
import { TEMPLATES, normalizeTemplate, TemplateInputFieldsSchema } from "./templates";
import { CourtConfigSchema } from "@workspace/api-zod/session";
import { TEMPLATE_PAGE_CONTENT, resolveTemplatePages, templatePagePath } from "./templatePages";

describe("one template catalog for public pages and session intake", () => {
  it("wires every preserved page to a usable template with unique routes", () => {
    const pages = resolveTemplatePages(TEMPLATES);
    expect(TEMPLATE_PAGE_CONTENT).toHaveLength(14);
    expect(new Set(pages.map(page => page.href)).size).toBe(pages.length);
    for (const content of TEMPLATE_PAGE_CONTENT) {
      const page = pages.find(page => page.template.id === content.templateId);
      expect(page, content.slug).toBeDefined();
      expect(page!.content).toBe(content);
      expect(page!.href).toBe(`/templates/${content.slug}`);
      expect(TemplateInputFieldsSchema.safeParse(page!.template.inputFields).success).toBe(true);
      expect(page!.template.inputFields.some(field => field.required)).toBe(true);
      expect(CourtConfigSchema.safeParse(page!.template.defaultConfig).success).toBe(true);
      expect(page!.template.systemPrompt.length).toBeGreaterThan(100);
    }
  });

  it("uses saved names, descriptions, categories, questions and settings without static overrides", () => {
    const template = normalizeTemplate({
      title: "Owner's business template", description: "Owner's description", category: "research", icon: "Search",
      inputFields: [{ id: "goal", label: "Owner's question", placeholder: "Your goal", type: "text", required: true }],
      defaultConfig: {litigantCount: 2},
    }, "business-plan")!;
    const [page] = resolveTemplatePages([template]);
    expect(page).toMatchObject({ title: template.title, description: template.description, category: "research", icon: "Search", badge: "Research" });
    expect(page.template).toBe(template);
    expect(page.template.defaultConfig.litigantCount).toBe(2);
    expect(page.template.inputFields[0].label).toBe("Owner's question");
    expect(page.image).toBe("/tools/business-plan-analyzer.jpg");
  });

  it("does not resurrect inactive entries and supports new admin templates without another page registry", () => {
    expect(resolveTemplatePages([])).toEqual([]);
    const custom = normalizeTemplate({id: "new-case", title: "New case", description: "Saved in admin"})!;
    expect(resolveTemplatePages([custom])).toMatchObject([{title: "New case", href: "/templates/new-case", template: custom}]);
    expect(templatePagePath(custom.id)).toBe("/templates/new-case");
  });
});
