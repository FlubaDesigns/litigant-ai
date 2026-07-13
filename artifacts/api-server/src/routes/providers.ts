import { Router } from "express";
import {
  getConfiguredProvidersAsync,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  DEFAULT_MODELS,
  DEFAULT_QUALITY_SCORES,
} from "../lib/providers/index.js";
import { getModelCreditInfo } from "../lib/creditEngine.js";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

async function loadAiStudioConfig(): Promise<{ disabledProviders: string[]; disabledModels: string[]; modelScores: Record<string, number> }> {
  try {
    const db = getFirestoreDb();
    if (!db) return { disabledProviders: [], disabledModels: [], modelScores: {} };
    const [aiStudioDoc, scoresDoc] = await Promise.all([
      db.collection("system_config").doc("aiStudio").get(),
      db.collection("system_config").doc("modelScores").get(),
    ]);
    const d = aiStudioDoc.data() ?? {};
    const scores = (scoresDoc.data() ?? {}) as Record<string, number>;
    return {
      disabledProviders: (d["disabledProviders"] as string[]) ?? [],
      disabledModels: (d["disabledModels"] as string[]) ?? [],
      modelScores: scores,
    };
  } catch {
    return { disabledProviders: [], disabledModels: [], modelScores: {} };
  }
}

// Use the async, Firestore-aware version so providers configured via Admin →
// API Keys (rather than env vars) appear as selectable options in the UI.
// The sync getConfiguredProviders() checks process.env only and misses any
// keys stored in Firestore — same root cause as brainEngine.ts's Finding #8.
router.get("/providers", async (_req, res) => {
  const [configured, { disabledProviders, disabledModels, modelScores }] = await Promise.all([
    getConfiguredProvidersAsync(),
    loadAiStudioConfig(),
  ]);

  // Merge default quality scores with any Firestore overrides
  const effectiveScores: Record<string, number> = { ...DEFAULT_QUALITY_SCORES, ...modelScores };

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
          qualityScore: effectiveScores[m.id] ?? m.qualityScore,
          creditInfo: getModelCreditInfo(m.id),
        })),
    })),
  });
});

export default router;
