import {getMultiplierOverrides} from "./pricingConfig.js";
import {
  getConfiguredProvidersAsync,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  DEFAULT_MODELS,
  DEFAULT_QUALITY_SCORES,
} from "./providers/index.js";
import { getModelCreditInfo } from "./creditEngine.js";
import { getFirestoreDb } from "./firebaseAdmin.js";


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


export async function getProviderCatalog() {
  const [configured, { disabledProviders, disabledModels, modelScores }, multipliers] = await Promise.all([
    getConfiguredProvidersAsync(),
    loadAiStudioConfig(),
    getMultiplierOverrides(),
  ]);

  // Merge default quality scores with any Firestore overrides
  const effectiveScores: Record<string, number> = { ...DEFAULT_QUALITY_SCORES, ...modelScores };

  // Filter out providers disabled in AI Studio
  const enabledProviders = configured.filter((name) => !disabledProviders.includes(name));

  return {
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
          creditInfo: (() => {const info=getModelCreditInfo(m.id);const multiplier=multipliers[m.id] ?? info.multiplier;return {...info,multiplier,exampleSessionCredits:Math.ceil(info.exampleSessionCredits*multiplier/info.multiplier)};})(),
        })),
    })),
  };
}
