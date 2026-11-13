import { evaluateSeatReview } from "@workspace/api-zod/evaluation";
import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { MultiplierSchema, saveMultiplierOverride, resetMultiplierToDefault } from "../../lib/pricingConfig.js";
import { safeError } from "../../lib/safeError.js";
import { getAllConfiguredProviders } from "../../lib/apiKeyStore.js";
import { getAdminPricingTable, getAiStudioModels, getModelRegistry, type CustomProviderDefinition } from "../../lib/providerCatalog.js";
import { PROVIDER_MODELS } from "../../lib/providers/index.js";
import { requireAdmin } from "./shared.js";

const router = Router();


// ── Pricing / Multiplier Config ───────────────────────────────────────────────

router.get("/admin/pricing", requireAdmin, async (_req, res) => {
  try {
    const table = await getAdminPricingTable(true);
    return res.json(table);
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.put("/admin/pricing/:model", requireAdmin, async (req, res) => {
  const { model } = req.params as { model: string };
  const parsed = MultiplierSchema.safeParse(req.body?.multiplier);
  if (!parsed.success) {
    return res.status(400).json({ error: "multiplier must be a number between 1 and 100" });
  }
  const value = parsed.data;

  try {
    const registry = await getModelRegistry();
    if (!registry.providers.some(p => p.models.some(m => m.id === model))) return res.status(404).json({error:"Unknown model"});
    await saveMultiplierOverride(model, value);
    return res.json({ success: true, model, multiplier: value });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.delete("/admin/pricing/:model", requireAdmin, async (req, res) => {
  const { model } = req.params as { model: string };
  try {
    const registry = await getModelRegistry();
    if (!registry.providers.some(p => p.models.some(m => m.id === model))) return res.status(404).json({error:"Unknown model"});
    await resetMultiplierToDefault(model);
    return res.json({ success: true, model, reset: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── API Key Management ────────────────────────────────────────────────────────

/** GET /admin/api-keys — list all configured providers (masked keys only) */
router.get("/admin/api-keys", requireAdmin, async (_req, res) => {
  try {
    const providers = await getAllConfiguredProviders();
    return res.json({ providers });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/** Credentials are administered only through the central Cortex. */
router.put("/admin/api-keys/:providerId", requireAdmin, (_req,res) => res.status(409).json({error:"Manage provider keys in Fluba Cortex.",url:"https://flubadesigns.com/admin/cortex"}));

router.delete("/admin/api-keys/:providerId", requireAdmin, (_req,res) => res.status(409).json({error:"Manage provider keys in Fluba Cortex.",url:"https://flubadesigns.com/admin/cortex"}));


// Master power changes only this flag; individual selections remain intact.
router.patch("/admin/ai-studio/power", requireAdmin, async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    await db.collection("system_config").doc("aiStudio").set(
      { aiEnabled: enabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true },
    );
    return res.json({ aiEnabled: enabled });
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/** Returns all known models, their prices, and the saved master power state. */
router.get("/admin/ai-studio/models", requireAdmin, async (_req, res) => {
  try {
    return res.json(await getAiStudioModels());
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/ai-studio/models/:modelId
 * Enable or disable an individual model.
 */
router.patch("/admin/ai-studio/models/:modelId", requireAdmin, async (req: any, res) => {
  const modelId = req.params["modelId"] as string;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let disabledModels: string[] = (snap.data()?.["disabledModels"] as string[]) ?? [];
      if (enabled) disabledModels = disabledModels.filter((m) => m !== modelId);
      else if (!disabledModels.includes(modelId)) disabledModels.push(modelId);
      tx.set(ref, { disabledModels, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return res.json({ ok: true, modelId, enabled });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/ai-studio/providers/:providerId
 * Enable or disable an entire provider (all its models hidden/shown).
 */
router.patch("/admin/ai-studio/providers/:providerId", requireAdmin, async (req: any, res) => {
  const providerId = req.params["providerId"] as string;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let disabledProviders: string[] = (snap.data()?.["disabledProviders"] as string[]) ?? [];
      if (enabled) disabledProviders = disabledProviders.filter((p) => p !== providerId);
      else if (!disabledProviders.includes(providerId)) disabledProviders.push(providerId);
      tx.set(ref, { disabledProviders, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return res.json({ ok: true, providerId, enabled });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});




/**
 * DELETE /admin/ai-studio/providers/:providerId
 * Remove a custom provider and all its models.
 */
router.delete("/admin/ai-studio/providers/:providerId", requireAdmin, async (req: any, res) => {
  const providerId = req.params["providerId"] as string;
  const BUILT_IN = Object.keys(PROVIDER_MODELS);
  if (BUILT_IN.includes(providerId)) {
    return res.status(400).json({ error: "Cannot delete a built-in provider. Disable it instead." });
  }
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });
  try {
    const ref = db.collection("system_config").doc("aiStudio");
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const customProviders = ((doc.data()?.customProviders as CustomProviderDefinition[]) ?? []).filter(cp => cp.id !== providerId);
      tx.set(ref, {customProviders, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    });
    return res.json({ ok: true, providerId });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * GET /admin/model-scores
 * Returns quality scores for all known models (default + Firestore overrides).
 * Used by the Admin AI Studio tab to let admins calibrate the intelligence slider.
 */
router.get("/admin/model-scores", requireAdmin, async (_req, res) => {
  try {
    const registry = await getModelRegistry();
    const models = registry.providers.flatMap(p => p.models);
    return res.json({scores:Object.fromEntries(models.map(m => [m.id, m.qualityScore])),
      overrides:Object.fromEntries(models.filter(m => m.qualityScore !== m.defaultQualityScore).map(m => [m.id, m.qualityScore]))});
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/model-scores/:modelId
 * Set a custom quality score (0–100) for a model. Stored in Firestore.
 * DELETE-equivalent: pass score: null to reset to default.
 */
router.patch("/admin/model-scores/:modelId", requireAdmin, async (req: any, res) => {
  const { modelId } = req.params;
  const { score } = req.body as { score?: number | null };
  if (score !== null && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100)) {
    return res.status(400).json({ error: "score must be a number between 0 and 100, or null to reset" });
  }
  try {
    const db = getFirestoreDb();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });
    const registry = await getModelRegistry();
    const model = registry.providers.flatMap(p => p.models).find(m => m.id === modelId);
    if (!model) return res.status(404).json({error:"Unknown model"});
    const ref = db.collection("system_config").doc("modelScores");
    if (score === null) {
      await ref.set({ [modelId]: FieldValue.delete() }, { merge: true });
    } else {
      await ref.set({ [modelId]: score, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return res.json({ ok: true, modelId, score: score ?? model.defaultQualityScore });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.post("/admin/seat-evaluations", requireAdmin, async (req: any, res) => {
  let evaluation;
  try { evaluation = evaluateSeatReview(req.body); }
  catch { return res.status(400).json({error:"Complete every rubric criterion with evidence and a response source."}); }
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error:"Evaluation storage is unavailable"});
  try {
    const ref = await db.collection("seat_evaluations").add({...evaluation, reviewerUid:req.adminUid, createdAt:FieldValue.serverTimestamp()});
    return res.status(201).json({id:ref.id, score:evaluation.score, passed:evaluation.passed, calibrated:false});
  } catch { return res.status(503).json({error:"Evaluation could not be saved"}); }
});

router.get("/admin/seat-evaluations", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error:"Evaluation storage is unavailable"});
  try {
    const snap = await db.collection("seat_evaluations").orderBy("createdAt","desc").limit(50).get();
    return res.json({reviews:snap.docs.map(doc => { const r=doc.data(); return {id:doc.id, model:r.model,seatId:r.seatId,score:r.score,passed:r.passed,rubricVersion:r.rubricVersion,source:r.source,response:r.response,pass:r.pass,fail:r.fail}; }), calibrated:false});
  } catch { return res.status(503).json({error:"Evaluations could not be loaded"}); }
});
export default router;
