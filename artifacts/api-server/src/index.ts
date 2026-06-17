import app from "./app";
import { logger } from "./lib/logger";
import { isSquareConfigured } from "./lib/squareClient.js";

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

function logSquareStatus() {
  if (isSquareConfigured()) {
    const env = process.env["SQUARE_ENVIRONMENT"] ?? "sandbox";
    logger.info(`[Square] Configured (${env}) — payment links ready`);
  } else {
    logger.warn("[Square] SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID not set — payments disabled");
  }
}

logSquareStatus();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
