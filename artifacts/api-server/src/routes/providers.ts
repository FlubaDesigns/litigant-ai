import { Router } from "express";
import {
  getConfiguredProviders,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  DEFAULT_MODELS,
} from "../lib/providers/index.js";
import { getModelCreditInfo } from "../lib/creditEngine.js";

const router = Router();

router.get("/providers", (_req, res) => {
  const configured = getConfiguredProviders();
  res.json({
    configured,
    creditValueUsd: 0.01,
    providers: configured.map((name) => ({
      name,
      displayName: PROVIDER_DISPLAY_NAMES[name],
      defaultModel: DEFAULT_MODELS[name],
      models: PROVIDER_MODELS[name].map((m) => ({
        ...m,
        creditInfo: getModelCreditInfo(m.id),
      })),
    })),
  });
});

export default router;
