import { Router } from "express";
import { getTemplates, getTemplate } from "../lib/templateStore.js";
const router = Router();
router.get("/templates", async (_req, res) => {
  try { return res.json(await getTemplates()); }
  catch { return res.status(503).json({message:"Saved templates could not be loaded"}); }
});
router.get("/templates/:id", async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({message:"Template not found"});
    return res.json(template);
  } catch { return res.status(503).json({message:"Saved templates could not be loaded"}); }
});
export default router;
