import { onRequest } from "firebase-functions/v2/https";
import app from "./app-firebase.js";

export const api = onRequest(
  { timeoutSeconds: 540, memory: "512MiB", region: "us-central1" },
  (req, res) => {
    req.url = req.url.replace(/^\/api-server/, "") || "/";
    (app as any)(req, res);
  }
);
