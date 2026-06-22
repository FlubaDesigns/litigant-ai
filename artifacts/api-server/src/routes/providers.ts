import { Router } from "express";
import {
  getConfiguredProvidersAsync,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  DEFAULT_MODELS,
} from "../lib/providers/index.js";
import { getModelCreditInfo } from "../lib/creditEngine.js";

const router = Router();

// Use the async, Firestore-aware version so providers configured via Admin →
// API Keys (rather than env vars) appear as selectable options in the UI.
// The sync getConfiguredProviders() checks process.env only and misses any
// keys stored in Firestore — same root cause as brainEngine.ts's Finding #8.
router.get("/providers", async (_req, res) => {
  const configured = await getConfiguredProvidersAsync();
  res.json({
    configured,
    creditValueUsd: 0.01,
    providers: configured.map((name) => ({
      name,
      displayName: PROVIDER_DISPLAY_NAMES[name as keyof typeof PROVIDER_DISPLAY_NAMES],
      defaultModel: DEFAULT_MODELS[name as keyof typeof DEFAULT_MODELS],
      models: (PROVIDER_MODELS[name as keyof typeof PROVIDER_MODELS] ?? []).map((m) => ({
        ...m,
        creditInfo: getModelCreditInfo(m.id),
      })),
    })),
  });
});

export default router;
