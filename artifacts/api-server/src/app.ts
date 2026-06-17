import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";
import { verifySquareWebhook, handleSquareEvent } from "./lib/squareEventHandler.js";

initFirebaseAdmin();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());

/**
 * POST /api/square/webhook
 * Receives Square webhook events. Must be registered BEFORE express.json()
 * so we can read the raw body for signature verification.
 */
app.post(
  "/api/square/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-square-hmacsha256-signature"] as string | undefined;

    if (!signature) {
      logger.warn("[SquareWebhook] Missing x-square-hmacsha256-signature header");
      res.status(400).json({ error: "Missing signature" });
      return;
    }

    const rawBody = (req.body as Buffer).toString("utf8");

    const notificationUrl =
      `https://${(process.env["REPLIT_DOMAINS"] as string | undefined)?.split(",")[0]}/api/square/webhook`;

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
  }
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
