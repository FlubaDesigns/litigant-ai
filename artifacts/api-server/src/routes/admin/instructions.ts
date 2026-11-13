import { ConfigurationUnavailableError } from "../../lib/configurationError.js";
import { CourtConfigFieldsSchema } from "@workspace/api-zod/session";
import { TemplateInputFieldsSchema } from "@workspace/api-zod/templates";
import { getTemplates } from "../../lib/templateStore.js";
import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { safeError } from "../../lib/safeError.js";
import { getConscienceConfiguration } from "../../lib/conscienceConfig.js";
import { SEAT_IDS, getSeatBriefsConfig, type SeatId } from "../../lib/seatBriefs.js";
import { requireAdmin, serializeDoc } from "./shared.js";

const router = Router();


// ── Canon / Conscience Config ─────────────────────────────────────────────────

/**
 * GET /admin/conscience
 * Returns the saved conscience clause or an actionable configuration error.
 */
router.get("/admin/conscience", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  try {
    const {document, clause} = await getConscienceConfiguration();
    return res.json({ exists: true, ...serializeDoc(document), ...clause });
  } catch (err: any) {
    return res.status(err instanceof ConfigurationUnavailableError ? 503 : 500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/conscience
 * Body: { text: string, version?: string }
 * Writes the authoritative instructions; every new run reads them before charging.
 */
router.patch("/admin/conscience", requireAdmin, async (req: any, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { text, version } = req.body as { text?: string; version?: string };

  if (!text?.trim()) {
    return res.status(400).json({ error: "text (string) is required and must not be empty" });
  }

  const newVersion = version?.trim() || `v-${new Date().toISOString().slice(0, 10)}`;

  try {
    await db.collection("system_config").doc("conscience").set({
      text: text.trim(),
      version: newVersion,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.adminUid as string,
    });

    return res.json({
      success: true,
      version: newVersion,
      note: "All new runs read the saved instructions before reserving credits.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── Templates ─────────────────────────────────────────────────────────────────

router.get("/admin/templates", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Template service unavailable"});

  try {
    return res.json({ templates: await getTemplates(true) });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.put("/admin/templates/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { title, description, isActive, systemPrompt, defaultSettings } = req.body as {
    title?: string;
    description?: string;
    isActive?: boolean;
    systemPrompt?: string;
    defaultSettings?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.length > 200) return res.status(400).json({error: "Enter a title of 1–200 characters"});
    updates["title"] = title.trim();
  }
  if (description !== undefined) {
    if (typeof description !== "string" || description.length > 2000) return res.status(400).json({error: "Description must be at most 2,000 characters"});
    updates["description"] = description;
  }
  if (typeof isActive === "boolean") updates["isActive"] = isActive;
  if (systemPrompt !== undefined) {
    if (typeof systemPrompt !== "string") return res.status(400).json({ error: "Invalid template instructions" });
    updates["systemPrompt"] = systemPrompt.trim() ? systemPrompt : FieldValue.delete();
  }
  if (req.body.inputFields !== undefined) {
    const fields = TemplateInputFieldsSchema.safeParse(req.body.inputFields);
    if (!fields.success) return res.status(400).json({error: "Questions need unique IDs, labels, valid types and required/optional settings (maximum 30)."});
    updates["inputFields"] = fields.data;
  }
  if (defaultSettings || req.body.defaultConfig) {
    const config = CourtConfigFieldsSchema.partial().strict().safeParse(req.body.defaultConfig ?? defaultSettings);
    if (!config.success) return res.status(400).json({error:"Invalid template settings"});
    updates["defaultConfig"] = config.data;
    updates["defaultSettings"] = FieldValue.delete();
  }

  try {
    await db.collection("templates").doc(req.params["id"]!).set(updates, { merge: true });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── Seat Briefs ───────────────────────────────────────────────────────────────

/**
 * GET /admin/seat-briefs
 * Returns all seat briefs — active (Firestore override or file fallback) plus
 * the factory-default file text for comparison.
 */
router.get("/admin/seat-briefs", requireAdmin, async (_req, res) => {
  try {
    return res.json(await getSeatBriefsConfig());
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/seat-briefs/:seatId
 * Body: { text: string }
 * Writes an override for a single seat brief to Firestore.
 */
router.patch("/admin/seat-briefs/:seatId", requireAdmin, async (req: any, res) => {
  const { seatId } = req.params as { seatId: string };
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  if (!SEAT_IDS.includes(seatId as SeatId)) {
    return res.status(400).json({
      error: `Invalid seatId. Must be one of: ${SEAT_IDS.join(", ")}`,
    });
  }

  const { text } = req.body as { text?: string };
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text (string) is required and must not be empty" });
  }

  try {
    await db.collection("system_config").doc("seat_briefs").set(
      {
        [seatId]: text.trim(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.adminUid as string,
      },
      { merge: true }
    );

    return res.json({ success: true, seatId, length: text.trim().length });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * DELETE /admin/seat-briefs/:seatId
 * Removes the Firestore override for a seat — reverts to the file default.
 */
router.delete("/admin/seat-briefs/:seatId", requireAdmin, async (req: any, res) => {
  const { seatId } = req.params as { seatId: string };
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  if (!SEAT_IDS.includes(seatId as SeatId)) {
    return res.status(400).json({ error: `Invalid seatId` });
  }

  try {
    await db.collection("system_config").doc("seat_briefs").set(
      { [seatId]: FieldValue.delete() },
      { merge: true }
    );

    return res.json({
      success: true,
      seatId,
      note: "Firestore override removed — file default is now active",
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});
export default router;
