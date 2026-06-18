import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index-firebase.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";

initFirebaseAdmin();

const app: Express = express();

app.use((req, _res, next) => {
  console.log(`[${req.method}] ${req.url?.split("?")[0]}`);
  next();
});

const allowedOrigins = [
  "https://litigant-ai.com",
  "https://www.litigant-ai.com",
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

export default app;
