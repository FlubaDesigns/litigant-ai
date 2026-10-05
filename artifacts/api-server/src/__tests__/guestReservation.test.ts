import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
vi.mock("../lib/rateLimiter.js", () => ({makeRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next()}));
vi.mock("../lib/brainEngine.js", () => ({runBrainSession: vi.fn()}));
import brainRouter from "../routes/brain.js";
import { runBrainSession } from "../lib/brainEngine.js";
const app = express().use(express.json()).use(brainRouter);
describe("private invitation access", () => {
  it("rejects the retired unauthenticated demo path, even for a first request", async () => {
    const response = await request(app).post("/run-brain").send({question:"Trial",config:{}});
    expect(response.status).toBe(401);
    expect(response.body.message).toContain("guest invitation");
    expect(runBrainSession).not.toHaveBeenCalled();
  });
});
