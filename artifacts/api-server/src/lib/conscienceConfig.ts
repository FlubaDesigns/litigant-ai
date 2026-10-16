/** The saved Canon is authoritative. Never substitute policy text or a stale cache. */
import { getFirestoreDb } from "./firebaseAdmin.js";
import { ConfigurationUnavailableError, loadConfiguration } from "./configurationError.js";

export interface ConscienceClause { text: string; version: string; }
export async function getConscienceConfiguration() {
  const db = getFirestoreDb();
  if (!db) throw new ConfigurationUnavailableError("Saved Canon instructions");
  return loadConfiguration("Saved Canon instructions", async () => {
    const doc = await db.collection("system_config").doc("conscience").get();
    const data = doc.exists ? doc.data() : undefined;
    if (typeof data?.text !== "string" || !data.text.trim() ||
        typeof data.version !== "string" || !data.version.trim()) {
      throw new Error("Saved Canon is missing or incomplete");
    }
    return {document: doc, clause: {text: data.text, version: data.version} as ConscienceClause};
  });
}

export async function getConscienceClause(): Promise<ConscienceClause> {
  return (await getConscienceConfiguration()).clause;
}
