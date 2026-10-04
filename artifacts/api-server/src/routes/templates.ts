import { Router } from "express";
import { getTemplates, getTemplate } from "../lib/templateStore.js";
const router = Router();
router.get("/templates", async (_req, res) => res.json(await getTemplates()));
router.get("/templates/:id", async (req, res) => {
  const template = await getTemplate(req.params.id);
  if (!template) return res.status(404).json({message:"Template not found"});
  return res.json(template);
});
export default router;
