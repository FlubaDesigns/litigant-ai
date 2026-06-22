import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";

initFirebaseAdmin();

const app: Express = express();

// Trust the first hop from Replit's reverse proxy so req.ip reflects the
// real client address (used by rate limiters) rather than the proxy address.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());

/**
 * JSON body parser with a verify callback that preserves the raw body string
 * on req.rawBody — used by Square webhook for HMAC-SHA256 verification.
 */
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
