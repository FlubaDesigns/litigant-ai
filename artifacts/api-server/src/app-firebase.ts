import { registerBrowserSession } from "./lib/authorizationBrowserSession.js";
import { getAuth } from "firebase-admin/auth";
import { getFirestoreDb } from "./lib/firebaseAdmin.js";
import * as Sentry from "@sentry/node";
import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index-firebase.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";
import { securityHeaders } from "./lib/securityHeaders.js";

// Initialise Sentry before any other setup so it can capture startup errors.
// No-op when SENTRY_DSN is unset (local dev, staging without monitoring).
if (process.env["SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    environment: process.env["NODE_ENV"] ?? "production",
    // Capture 5% of transactions for performance monitoring — low overhead.
    tracesSampleRate: 0.05,
    // Always capture 100% of errors.
    sampleRate: 1.0,
  });
}

initFirebaseAdmin();

const app: Express = express();

// Cloud Run and Firebase Functions sit behind Google's load balancer.
// Trust the first proxy hop so req.ip reflects the real client address
// (read from X-Forwarded-For) rather than the internal load-balancer IP.
// Without this, the IP-based rate limiters in auth.ts bucket every user
// together and the limit fires globally rather than per client.
app.set("trust proxy", 1);

app.use((req, _res, next) => {
  console.log(`[${req.method}] ${req.url?.split("?")[0]}`);
  next();
});

const allowedOrigins = [
  "https://litigant-ai.com",
  "https://www.litigant-ai.com",
  "https://litigant-ai.web.app",
  "https://litigant-ai.firebaseapp.com",
  ...(process.env["APP_DOMAIN"] ? [`https://${process.env["APP_DOMAIN"]}`] : []),
];

app.use(securityHeaders);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
  }),
);

/**
 * Capture raw body before JSON parsing so Square webhook handler can verify
 * the HMAC-SHA256 signature against the exact bytes Square sent.
 */
app.use(
  express.json({
    limit: "10mb",
    verify: (_req, _res, buf) => {
      (_req as any).rawBody = buf.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Same browser-bound, one-use protocol as the central Authorization Engine.
const engineDb = getFirestoreDb();
if (engineDb) registerBrowserSession(app, {db: engineDb, auth: getAuth(), config: {
  origin: "https://litigant-ai.web.app",
  principal: "github-action-1249917275@flubadesigns-25482.iam.gserviceaccount.com",
}});
app.use("/api", router);

// Sentry error handler must come after routes and before any other error middleware.
if (process.env["SENTRY_DSN"]) {
  Sentry.setupExpressErrorHandler(app);
}

export default app;
