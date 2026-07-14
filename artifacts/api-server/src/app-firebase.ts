import * as Sentry from "@sentry/node";
import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index-firebase.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";

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
  ...(process.env["REPLIT_DOMAINS"]
    ? process.env["REPLIT_DOMAINS"].split(",").map((d) => `https://${d.trim()}`)
    : []),
];

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

app.use("/api", router);

// Sentry error handler must come after routes and before any other error middleware.
if (process.env["SENTRY_DSN"]) {
  Sentry.setupExpressErrorHandler(app);
}

export default app;
