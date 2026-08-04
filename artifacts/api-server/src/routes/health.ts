import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/health", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * GET /version
 *
 * Returns the git commit SHA that was injected at deploy time.
 * The CI workflow sets GIT_SHA=${{ github.sha }} and deploy-cloudrun.mjs
 * forwards it to the Cloud Run container as DEPLOY_GIT_SHA.
 *
 * Used for deploy-pipeline provenance: after every Cloud Run deploy the
 * CI workflow fetches this endpoint and asserts that the returned sha
 * matches ${{ github.sha }}, proving the deployed image matches the source
 * commit that triggered the workflow.
 *
 * Returns { sha: string, deployedAt: string } where sha is "unknown" if the
 * env var is not set (local dev / Replit dev server).
 */
router.get("/version", (_req, res) => {
  res.json({
    sha: process.env["DEPLOY_GIT_SHA"] ?? "unknown",
    deployedAt: process.env["DEPLOY_TIMESTAMP"] ?? "unknown",
  });
});

export default router;
