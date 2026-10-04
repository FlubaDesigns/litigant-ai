import { Router } from "express";
import { getProviderCatalog } from "../lib/providerCatalog.js";
const router = Router();
router.get("/providers", async (_req, res) => res.json(await getProviderCatalog()));
export default router;
