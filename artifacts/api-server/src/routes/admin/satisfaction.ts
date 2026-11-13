import { Router } from "express";
import { readSatisfactionSummary } from "../../lib/satisfaction.js";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { requireAdmin } from "./shared.js";
const router=Router();
router.get("/admin/satisfaction",requireAdmin,async (_req,res)=>{
  const db=getFirestoreDb();
  if (!db) return res.status(503).json({error:"Satisfaction scores are unavailable."});
  try {
    return res.json(await readSatisfactionSummary(db));
  } catch {return res.status(503).json({error:"Satisfaction scores could not be loaded. Please try again."});}
});
export default router;
