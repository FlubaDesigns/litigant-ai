import { Router } from "express";
import { getConfiguredProviders, PROVIDER_DISPLAY_NAMES, PROVIDER_MODELS, DEFAULT_MODELS } from "../lib/providers/index.js";

const router = Router();

router.get("/providers", (_req, res) => {
  const configured = getConfiguredProviders();
  res.json({
    configured,
    providers: configured.map((name) => ({
      name,
      displayName: PROVIDER_DISPLAY_NAMES[name],
      defaultModel: DEFAULT_MODELS[name],
      models: PROVIDER_MODELS[name],
    })),
  });
});

export default router;
