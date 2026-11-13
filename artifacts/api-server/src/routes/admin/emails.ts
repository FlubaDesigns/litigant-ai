import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { runReengagementCampaign, renderTemplatePreview, retryEmailDelivery } from "../../lib/emailService.js";
import { EMAIL_TEMPLATE_IDS, EMAIL_TEMPLATE_META, getTemplateConfig, saveTemplateConfig, listTemplateVersions, saveTemplateVersion, activateTemplateVersion, deleteTemplateVersion, type EmailTemplateId, validateTemplateContent } from "../../lib/emailTemplateStore.js";
import { safeError } from "../../lib/safeError.js";
import { requireAdmin } from "./shared.js";

const router = Router();


/**
 * POST /admin/send-reengagement
 * Triggers the re-engagement email campaign for users inactive for ≥ N days.
 * Manually triggered by the owner. Defaults to 14 days of inactivity.
 */
router.post("/admin/send-reengagement", requireAdmin, async (req: any, res) => {
  const inactiveDays = req.body?.inactiveDays ?? 14;
  if (!Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 365) return res.status(400).json({error: "Choose 1–365 inactive days"});
  try {
    const result = await runReengagementCampaign(inactiveDays);
    return res.json({ success: true, emailsSent: result.sent, failed: result.failed, skipped: result.skipped, inactiveDays });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.get("/admin/email-deliveries", requireAdmin, async (_req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Email history unavailable"});
  try {
    const records = await db.collection("email_deliveries").orderBy("updatedAt", "desc").limit(25).get();
    return res.json({deliveries: records.docs.map(doc => {
      const data = doc.data();
      return {id: doc.id, userId: data.userId, templateId: data.templateId, status: data.status, updatedAt: data.updatedAt};
    })});
  } catch { return res.status(503).json({error: "Email history unavailable"}); }
});


router.post("/admin/email-deliveries/:id/retry", requireAdmin, async (req, res) => {
  try { return res.json({sent: await retryEmailDelivery(req.params["id"]!)}); }
  catch { return res.status(503).json({error: "Email could not be retried. Request a fresh verification/reset link if it has expired."}); }
});

// ── Email template management ─────────────────────────────────────────────────

/**
 * GET /admin/email-templates
 * Returns all template IDs with their metadata + current active config.
 */
router.get("/admin/email-templates", requireAdmin, async (_req, res) => {
  try {
    const configs = await Promise.all(
      EMAIL_TEMPLATE_IDS.map(async (id) => {
        const config = await getTemplateConfig(id);
        const meta = EMAIL_TEMPLATE_META[id];
        return {
          id,
          label: meta.label,
          trigger: meta.trigger,
          tokens: meta.tokens,
          canDisable: meta.canDisable,
          defaultSubject: meta.defaultSubject,
          defaultHeadline: meta.defaultHeadline,
          defaultIntroText: meta.defaultIntroText,
          enabled: config.enabled,
          subject: config.subject,
          headline: config.headline,
          introText: config.introText,
          updatedAt: config.updatedAt,
          updatedBy: config.updatedBy,
        };
      })
    );
    return res.json({ templates: configs });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/email-templates/:id
 * Update the active config for a template (subject, headline, introText, enabled).
 */
router.patch("/admin/email-templates/:id", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  const { enabled, subject, headline, introText } = req.body as {
    enabled?: unknown; subject?: unknown; headline?: unknown; introText?: unknown;
  };

  // Runtime bounds — admin-only doesn't eliminate the risk of malformed or
  // oversized documents breaking email rendering downstream.
  const MAX_SUBJECT   = 200;
  const MAX_HEADLINE  = 200;
  const MAX_INTRO     = 3000;

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  if (subject !== undefined) {
    if (typeof subject !== "string" || subject.length > MAX_SUBJECT) {
      return res.status(400).json({ error: `subject must be a string under ${MAX_SUBJECT} characters` });
    }
  }
  if (headline !== undefined) {
    if (typeof headline !== "string" || headline.length > MAX_HEADLINE) {
      return res.status(400).json({ error: `headline must be a string under ${MAX_HEADLINE} characters` });
    }
  }
  if (introText !== undefined) {
    if (typeof introText !== "string" || introText.length > MAX_INTRO) {
      return res.status(400).json({ error: `introText must be a string under ${MAX_INTRO} characters` });
    }
  }

  try { validateTemplateContent(id, { subject: subject as string | undefined, headline: headline as string | undefined, introText: introText as string | undefined }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  if (enabled === false && !EMAIL_TEMPLATE_META[id].canDisable) return res.status(400).json({ error: "This account email cannot be disabled" });
  try {
    await saveTemplateConfig(
      id,
      {
        ...(enabled !== undefined ? { enabled: enabled as boolean } : {}),
        ...(subject !== undefined ? { subject: subject as string } : {}),
        ...(headline !== undefined ? { headline: headline as string } : {}),
        ...(introText !== undefined ? { introText: introText as string } : {}),
      },
      req.adminUid as string
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * GET /admin/email-templates/:id/preview
 * Returns the rendered HTML for the template using sample data.
 * Accepts optional query params: subject, headline, introText for live preview.
 */
router.get("/admin/email-templates/:id/preview", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  const { subject, headline, introText } = req.query as { subject?: string; headline?: string; introText?: string };
  try { validateTemplateContent(id, { subject, headline, introText }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  try {
    const html = await renderTemplatePreview(id, { subject, headline, introText });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    return res.send(html);
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * GET /admin/email-templates/:id/versions
 * List all saved versions for a template (newest first, max 20).
 */
router.get("/admin/email-templates/:id/versions", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  try {
    const versions = await listTemplateVersions(id);
    return res.json({ versions });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * POST /admin/email-templates/:id/versions
 * Save the current active config as a named version snapshot.
 * Body: { versionName: string }
 */
router.post("/admin/email-templates/:id/versions", requireAdmin, async (req: any, res) => {
  const id = req.params["id"] as EmailTemplateId;
  if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
    return res.status(400).json({ error: "Unknown template ID" });
  }
  const { versionName, draft } = req.body;
  if (typeof versionName !== "string" || !versionName.trim() || versionName.length > 100) {
    return res.status(400).json({ error: "versionName is required" });
  }
  if (draft !== undefined) {
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return res.status(400).json({ error: "Invalid email draft" });
    try { validateTemplateContent(id, draft); }
    catch (error: any) { return res.status(400).json({ error: error.message }); }
  }
  try {
    const versionId = await saveTemplateVersion(id, versionName.trim(), req.adminUid as string, draft);
    return res.json({ success: true, versionId });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * POST /admin/email-templates/:id/versions/:versionId/activate
 * Copy the version's content into the active template config.
 */
router.post(
  "/admin/email-templates/:id/versions/:versionId/activate",
  requireAdmin,
  async (req: any, res) => {
    const { id, versionId } = req.params as { id: EmailTemplateId; versionId: string };
    if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
      return res.status(400).json({ error: "Unknown template ID" });
    }
    try {
      await activateTemplateVersion(id, versionId, req.adminUid as string);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(err.message === "Version not found" ? 404 : 500).json({ error: safeError(err) });
    }
  }
);


/**
 * DELETE /admin/email-templates/:id/versions/:versionId
 */
router.delete(
  "/admin/email-templates/:id/versions/:versionId",
  requireAdmin,
  async (req: any, res) => {
    const { id, versionId } = req.params as { id: EmailTemplateId; versionId: string };
    if (!(EMAIL_TEMPLATE_IDS as readonly string[]).includes(id)) {
      return res.status(400).json({ error: "Unknown template ID" });
    }
    try {
      await deleteTemplateVersion(id, versionId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: safeError(err) });
    }
  }
);
export default router;
