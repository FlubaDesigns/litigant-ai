vi.mock("../lib/runInstructions.js", () => ({getRunInstructions: async () => ({
  conscience: {text:"Offline test instructions",version:"test"},
  seats: {orchestrator:"Test",moderator:"Test",architect:"Test",builder:"Test",auditor:"Test",litigant:"Test"},
})}));
import { DEFAULT_PLATFORM_LIMITS } from "@workspace/api-zod/limits";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// All authentication is local; no Firebase, document services, or live sites
// are contacted. Supertest uses an ephemeral loopback server for this router.
vi.mock("../lib/firebaseAdmin.js", () => ({
  verifyIdToken: vi.fn(),
  initFirebaseAdmin: vi.fn(),
  isFirebaseConfigured: vi.fn(() => false),
  getFirestoreDb: vi.fn(() => null),
}));
vi.mock("@sentry/node", () => ({ init: vi.fn(), setupExpressErrorHandler: vi.fn() }));
import { verifyIdToken } from "../lib/firebaseAdmin.js";
vi.mock("../lib/adminLimitsConfig.js", () => ({getAdminLimits: async () => DEFAULT_PLATFORM_LIMITS}));
vi.mock("../lib/rateLimiter.js", () => ({makeRateLimiter: () => (_req:any,_res:any,next:any) => next()}));
import router from "../routes/caseFile.js";

const auth = vi.mocked(verifyIdToken);
const bodyParsing = vi.fn();
const app = express();
app.use((req, _res, next) => {
  // Multer starts consuming multipart input through req.pipe(). Observing the
  // real stream preserves the real parser while detecting premature parsing.
  const pipe = req.pipe;
  req.pipe = function (...args: Parameters<typeof pipe>) {
    bodyParsing();
    return pipe.apply(req, args);
  } as typeof pipe;
  next();
});
app.use(express.json(), router);
app.get("/health", (_req, res) => res.json({ status: "ok" }));

function validUpload() {
  return request(app).post("/case-file/upload")
    .set("Authorization", "Bearer valid-token")
    .attach("file", Buffer.from("Local case evidence"), {
      filename: "evidence.txt", contentType: "text/plain",
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ uid: "test-user" });
});

describe("case-file upload security", () => {
  it.each([undefined, "Basic invalid"])("rejects missing/unsupported authorization before reading input (%s)", async (authorization) => {
    const upload = request(app).post("/case-file/upload");
    if (authorization) upload.set("Authorization", authorization);
    const response = await upload.attach("file", Buffer.from("evidence"), "evidence.txt");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(auth).not.toHaveBeenCalled();
    expect(bodyParsing).not.toHaveBeenCalled();
  });

  it("rejects an invalid token before reading input", async () => {
    auth.mockResolvedValueOnce(null);
    const response = await validUpload();
    expect(response.status).toBe(401);
    expect(auth).toHaveBeenCalledExactlyOnceWith("valid-token");
    expect(bodyParsing).not.toHaveBeenCalled();
  });

  it("checks authorization before even validating a malformed multipart header", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Content-Type", "multipart/form-data")
      .send("Missing boundary");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(bodyParsing).not.toHaveBeenCalled();
  });

  it("waits for successful asynchronous verification before parsing a valid file", async () => {
    let completeAuth!: (value: { uid: string }) => void;
    let authStarted!: () => void;
    const started = new Promise<void>((resolve) => { authStarted = resolve; });
    auth.mockImplementationOnce(() => {
      authStarted();
      return new Promise((resolve) => { completeAuth = resolve; });
    });
    const pending = validUpload().then((response) => response);
    await started;
    expect(bodyParsing).not.toHaveBeenCalled();
    completeAuth({ uid: "test-user" });
    const response = await pending;
    expect(bodyParsing).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "evidence.txt", content: "Local case evidence" });
  });

  it("fails closed if token verification throws", async () => {
    auth.mockRejectedValueOnce(new Error("Private auth details"));
    const response = await validUpload();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: "Upload failed" });
    expect(bodyParsing).not.toHaveBeenCalled();
  });

  it.each([
    ["multipart/form-data", "Missing boundary"],
    ["multipart/form-data; boundary=local-test", "--local-test\r\nContent-Disposition: form-data; name=\"file\"; filename=\"evidence.txt\"\r\nContent-Type: text/plain\r\n\r\nIncomplete file"],
  ])("returns a controlled error for malformed multipart input (%s)", async (contentType, payload) => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", contentType).send(payload);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid file upload" });
    // A parse error must not poison the router or terminate the process.
    expect((await validUpload()).status).toBe(200);
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
  });

  it("preserves JSON extraction", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.from('{"evidence":true}'), { filename: "evidence.json", contentType: "application/json" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "evidence.json", content: '{\n  "evidence": true\n}' });
  });

  it.each([10 * 1024 * 1024 - 1, 10 * 1024 * 1024])("accepts %i bytes at or below the 10 MB ceiling and keeps output bounded", async (size) => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.alloc(size, "x"), "evidence.txt");
    expect(response.status).toBe(200);
    expect(response.body.content).toHaveLength(12000);
  });

  it("retains the 10 MB limit and its existing client-facing error", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1, "x"), "evidence.txt");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "File exceeds the 10 MB limit" });
  });

  it("rejects unused text fields", async () => {
    const response = await validUpload().field("unused", "not part of this API");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid file upload" });
  });

  it("rejects a second file", async () => {
    const response = await validUpload().attach("file", Buffer.from("extra"), "extra.txt");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid file upload" });
  });

  it("bounds total parts even when a part has no field name", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "multipart/form-data; boundary=local-test")
      .send([
        "--local-test", "Content-Disposition: form-data", "", "ignored",
        "--local-test", 'Content-Disposition: form-data; name="file"; filename="evidence.txt"',
        "Content-Type: text/plain", "", "evidence", "--local-test--", "",
      ].join("\r\n"));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid file upload" });
  });

  it("rejects an unexpected file field", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("other", Buffer.from("evidence"), "evidence.txt");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid file upload" });
  });

  it("preserves the missing-file response for a non-multipart request", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token").send({});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "No file uploaded" });
  });

  it("preserves file signature validation", async () => {
    const response = await request(app).post("/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.from("Not a PDF"), { filename: "evidence.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "File does not appear to be a valid PDF" });
  });

  it("leaves fetch-url validation and unrelated routes unchanged", async () => {
    const unauthenticated = await request(app).post("/case-file/fetch-url").send({});
    expect(unauthenticated.status).toBe(401);
    const authenticated = await request(app).post("/case-file/fetch-url")
      .set("Authorization", "Bearer valid-token").send({});
    expect(authenticated.status).toBe(400);
    expect(authenticated.body).toEqual({ message: "url is required" });
    expect((await request(app).get("/health")).status).toBe(200);
  });

  it("preserves the authentication gate through the production app middleware and /api mount", async () => {
    const { default: productionApp } = await import("../app-firebase.js");
    const unauthorized = await request(productionApp).post("/api/case-file/upload")
      .set("Content-Type", "multipart/form-data").send("Missing boundary");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual({ error: "Unauthorized" });
    expect(auth).not.toHaveBeenCalled();
    const authorized = await request(productionApp).post("/api/case-file/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.from("Local case evidence"), "evidence.txt");
    expect(authorized.status).toBe(200);
    expect(authorized.body).toEqual({ name: "evidence.txt", content: "Local case evidence" });
  });
});
