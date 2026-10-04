import { TEMPLATES, normalizeTemplate, type Template } from "@workspace/api-zod/templates";
import { getFirestoreDb } from "./firebaseAdmin.js";

export async function getTemplates(includeInactive = false): Promise<Template[]> {
  const catalog = new Map(TEMPLATES.map(t => [t.id, t]));
  const db = getFirestoreDb();
  if (db) {
    try {
    const snap = await db.collection("templates").get();
    for (const doc of snap.docs) {
      if (!includeInactive && doc.data().isActive === false) { catalog.delete(doc.id); continue; }
      const template = normalizeTemplate(doc.data(), doc.id);
      if (template) catalog.set(doc.id, template);
    }
    } catch (error) {
      console.error("[templates] Override catalogue unavailable; using shared defaults", {code: (error as {code?: unknown}).code});
    }
  }
  return [...catalog.values()];
}
export async function getTemplate(id: string, includeInactive = false): Promise<Template | null> {
  return (await getTemplates(includeInactive)).find(t => t.id === id) ?? null;
}
