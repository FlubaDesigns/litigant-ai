import { Router } from "express";
import { verifySquareWebhook, handleSquareEvent } from "../lib/squareEventHandler.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * POST /square/webhook  (mounted under /api → full path /api/square/webhook)
 *
 * Raw body is preserved by the rawBodySaver middleware in app.ts so we can
 * verify Square's HMAC-SHA256 signature before processing.
 */
router.post("/square/webhook", async (req, res) => {
  const signature = req.headers["x-square-hmacsha256-signature"] as string | undefined;

  if (!signature) {
    logger.warn("[SquareWebhook] Missing x-square-hmacsha256-signature header");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  const rawBody: string = (req as any).rawBody ?? "";

  const domain =
    process.env["APP_DOMAIN"] ??
    (process.env["REPLIT_DOMAINS"] as string | undefined)?.split(",")[0];
  const notificationUrl = `https://${domain}/api-server/api/square/webhook`;

  const valid = verifySquareWebhook(rawBody, signature, notificationUrl);
  if (!valid) {
    logger.warn("[SquareWebhook] Invalid signature — rejected");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  try {
    const event = JSON.parse(rawBody);
    await handleSquareEvent(event);
  } catch (err: any) {
    logger.warn({ err }, "Square event handler error (non-fatal)");
  }

  res.status(200).json({ received: true });
});

export default router;
