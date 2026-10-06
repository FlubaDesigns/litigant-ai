import { z } from "zod";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { AiDisabledError } from "./providerErrors.js";

// The existing AI Studio document is the single source for the master switch
// and individual selections. Do not cache: every new paid call checks it.
export async function getAiStudioConfig(): Promise<Record<string, unknown> & { aiEnabled: boolean }> {
  const snapshot = await getFirestoreDb()?.collection("system_config").doc("aiStudio").get();
  const config = snapshot?.data() ?? {};
  return { ...config, aiEnabled: z.boolean().parse(config.aiEnabled ?? true) };
}

export async function assertAiEnabled(): Promise<void> {
  if (!(await getAiStudioConfig()).aiEnabled) throw new AiDisabledError();
}
