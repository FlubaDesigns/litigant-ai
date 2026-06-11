import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env["DATABASE_URL"];
  const connectorHostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const hasStripeConnector = !!(
    connectorHostname &&
    (process.env["REPL_IDENTITY"] || process.env["WEB_REPL_RENEWAL"])
  );

  if (!databaseUrl) {
    logger.warn("[Stripe] DATABASE_URL not set — skipping Stripe initialization");
    return;
  }

  if (!hasStripeConnector) {
    logger.warn("[Stripe] Stripe connector not configured — skipping initialization");
    return;
  }

  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const { getStripeSync } = await import("./lib/stripeClient.js");

    logger.info("[Stripe] Running migrations...");
    await runMigrations({ databaseUrl });
    logger.info("[Stripe] Migrations done");

    const stripeSync = await getStripeSync();

    const domains = process.env["REPLIT_DOMAINS"]?.split(",")[0];
    if (domains) {
      const webhookUrl = `https://${domains}/api-server/api/stripe/webhook`;
      logger.info({ webhookUrl }, "[Stripe] Setting up managed webhook...");
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      logger.info("[Stripe] Webhook configured");
    }

    stripeSync.syncBackfill().then(() => {
      logger.info("[Stripe] Backfill complete");
    }).catch((err: any) => {
      logger.warn({ err }, "[Stripe] Backfill error (non-fatal)");
    });
  } catch (err: any) {
    logger.warn({ err }, "[Stripe] Initialization error (non-fatal — server will still start)");
  }
}

initStripe().catch((err) => {
  logger.warn({ err }, "[Stripe] initStripe outer catch");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
