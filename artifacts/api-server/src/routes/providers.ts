import { Router } from "express";
import {
  getConfiguredProvidersAsync,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  DEFAULT_MODELS,
} from "../lib/providers/index.js";
import { getModelCreditInfo } from "../lib/creditEngine.js";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

async function loadAiStudioConfig(): Promise<{ disabledProviders: string[]; disabledModels: string[] }> {
  try {
    const db = getFirestoreDb();
    if (!db) return { disabledProviders: [], disabledModels: [] };
    const doc = await db.collection("system_config").doc("aiStudio").get();
    const d = doc.data() ?? {};
    return {
      disabledProviders: (d["disabledProviders"] as string[]) ?? [],
      disabledModels: (d["disabledModels"] as string[]) ?? [],
    };
  } catch {
    return { disabledProviders: [], disabledModels: [] };
  }
}

// Use the async, Firestore-aware version so providers configured via Admin →
// API Keys (rather than env vars) appear as selectable options in the UI.
// The sync getConfiguredProviders() checks process.env only and misses any
// keys stored in Firestore — same root cause as brainEngine.ts's Finding #8.
router.get("/providers", async (_req, res) => {
  const [configured, { disabledProviders, disabledModels }] = await Promise.all([
    getConfiguredProvidersAsync(),
    loadAiStudioConfig(),
  ]);

  // Filter out providers disabled in AI Studio
  const enabledProviders = configured.filter((name) => !disabledProviders.includes(name));

  res.json({
    configured: enabledProviders,
    creditValueUsd: 0.01,
    providers: enabledProviders.map((name) => ({
      name,
      displayName: PROVIDER_DISPLAY_NAMES[name as keyof typeof PROVIDER_DISPLAY_NAMES],
      defaultModel: DEFAULT_MODELS[name as keyof typeof DEFAULT_MODELS],
      models: (PROVIDER_MODELS[name as keyof typeof PROVIDER_MODELS] ?? [])
        .filter((m) => !disabledModels.includes(m.id))
        .map((m) => ({
          ...m,
          creditInfo: getModelCreditInfo(m.id),
        })),
    })),
  });
});

export default router;
