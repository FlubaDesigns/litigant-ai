import { Router } from "express";
import { getChecklist, setChecklistItemChecked } from "../../lib/checklistConfig.js";
import { safeError } from "../../lib/safeError.js";
import { requireAdmin } from "./shared.js";

const router = Router();


/**
 * GET /admin/checklist
 * Returns the Setup Checklist items (agent + owner sections) merged with
 * their persisted checked state.
 */
router.get("/admin/checklist", requireAdmin, async (_req, res) => {
  try {
    const items = await getChecklist();
    return res.json({ items });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/checklist/:id
 * Toggles a single checklist item's checked state.
 */
router.patch("/admin/checklist/:id", requireAdmin, async (req: any, res) => {
  const { checked } = req.body as { checked?: boolean };
  if (typeof checked !== "boolean") {
    return res.status(400).json({ error: "checked must be a boolean" });
  }
  try {
    await setChecklistItemChecked(req.params.id, checked);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: safeError(err) });
  }
});
export default router;
