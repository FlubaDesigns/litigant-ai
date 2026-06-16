import express from "express";
import innerApp from "./app-firebase.js";

const wrapperApp = express();

// Firebase Hosting rewrites pass the full path e.g. /api-server/api/run-brain
// Strip that prefix before forwarding to the inner Express app
wrapperApp.use((req, _res, next) => {
  req.url = req.url.replace(/^\/api-server/, "") || "/";
  next();
});

wrapperApp.use(innerApp);

const port = parseInt(process.env["PORT"] || "8080", 10);
wrapperApp.listen(port, "0.0.0.0", () => {
  console.log(`[CloudRun] Listening on port ${port}`);
});
