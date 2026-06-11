import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";
import { WebhookHandlers } from "./lib/webhookHandlers.js";
import { handleStripeEventForFirestore } from "./lib/stripeEventHandler.js";

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

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    if (!Buffer.isBuffer(req.body)) {
      logger.error(
        "STRIPE WEBHOOK ERROR: req.body is not a Buffer — ensure this route is registered BEFORE express.json()"
      );
      res.status(500).json({ error: "Webhook processing error" });
      return;
    }

    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook processWebhook error");
      res.status(400).json({ error: "Webhook processing error" });
      return;
    }

    try {
      const event = JSON.parse((req.body as Buffer).toString("utf8"));
      await handleStripeEventForFirestore(event);
    } catch (err: any) {
      logger.warn({ err }, "Stripe Firestore event handler error (non-fatal)");
    }

    res.status(200).json({ received: true });
  }
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
