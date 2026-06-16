import * as functions from "firebase-functions/v1";
import app from "./app-firebase.js";

export const api = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onRequest((req, res) => {
    req.url = req.url.replace(/^\/api-server/, "") || "/";
    (app as any)(req, res);
  });
