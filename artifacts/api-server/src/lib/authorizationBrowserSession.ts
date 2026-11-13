import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";


export type BrowserSessionConfig = { origin: string; principal: string };
const lifetime = 10 * 60_000;
const cookieOptions = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/api-server/api/auth/engine" };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const denied = (status = 403, publicMessage = "Authorization Engine sign-in could not complete.") => Object.assign(new Error(publicMessage), { status, publicMessage });

/** Existing Authorization Engine protocol: Main approves a browser-bound, one-use request.
 * No role grants, password changes, API exemptions, or bearer tokens in logs/URLs. */
export function registerBrowserSession(app: Express, deps: {
  db: Firestore; auth: Auth; config: BrowserSessionConfig | null; now?: () => number;
  verifyIdentity?: (token: string, audience: string) => Promise<any>;
}) {
  const { db, auth, config } = deps, now = deps.now || Date.now;
  const google = new OAuth2Client();
  const verify = deps.verifyIdentity || (async (token, audience) => (await google.verifyIdToken({ idToken: token, audience })).getPayload());
  const sessions = db.collection("authorizationEngineSessions");
  const wrap = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!config || !config.origin.startsWith("https://") || new URL(config.origin).origin !== config.origin ||
          !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(config.principal)) throw denied(404);
      await handler(req, res);
    } catch (error: any) {
      res.status([400, 401, 403, 404, 409, 410, 429].includes(error?.status) ? error.status : 503)
        .json({ error: error?.publicMessage || "The sign-in service is temporarily unavailable. Please try again." });
    }
  };
  const browser = (req: Request) => { if (req.get("origin") !== config!.origin) throw denied(); };
  const eligible = (user: {disabled?: boolean; emailVerified?: boolean; customClaims?: Record<string, unknown>}) =>
    !user.disabled && user.emailVerified === true && user.customClaims?.admin === true;
  const owner = async () => {
    // Firebase administrator claims are authoritative. Never assume that an
    // email from another project is an account here, and never grant a role.
    let selected: string | undefined, pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await auth.listUsers(1000, pageToken);
      for (const user of result.users.filter(eligible)) {
        if (selected) throw denied(403, "Administrator access needs a unique verified administrator. Contact site support.");
        selected = user.uid;
      }
      pageToken = result.pageToken;
      if (!pageToken) {
        if (!selected) throw denied(403, "No verified administrator is configured for this site. Contact site support.");
        return selected;
      }
    }
    throw denied(503, "Administrator access could not be resolved. Contact site support.");
  };
  const active = (data: any) => {
    if (!data || !Number.isFinite(data.expiresAtMs) || data.expiresAtMs <= now() ||
        data.origin !== config!.origin || !["pending", "approved"].includes(data.status)) throw denied(410);
  };
  app.post("/api/auth/engine/session", wrap(async (req, res) => {
    browser(req);
    const requestId = randomUUID(), verifier = randomBytes(32).toString("hex"), createdAtMs = now(), expiresAtMs = createdAtMs + lifetime;
    const rateRef = sessions.doc("rate-" + hash(req.ip || req.socket.remoteAddress || "unknown"));
    await db.runTransaction(async tx => {
      const rate = (await tx.get(rateRef)).data();
      const count = rate?.expiresAtMs > createdAtMs ? Number(rate?.count) : 0;
      if (!Number.isFinite(count) || count >= 5) throw denied(429);
      tx.set(rateRef, { count: count + 1, expiresAtMs: rate?.expiresAtMs > createdAtMs ? rate?.expiresAtMs : expiresAtMs });
      tx.create(sessions.doc(requestId), { status: "pending", origin: config!.origin, verifierHash: hash(verifier), createdAtMs, expiresAtMs });
    });
    res.cookie("__session", "fluba-engine-" + verifier, { ...cookieOptions, maxAge: lifetime });
    res.status(201).json({ requestId, expiresAtMs });
  }));
  app.post("/api/auth/engine/session/:id/approve", wrap(async (req, res) => {
    if (!validId(req.params.id)) throw denied(400);
    const bearer = /^Bearer ([^\s]+)$/.exec(req.get("authorization") || "");
    if (!bearer) throw denied(401);
    let identity;
    try { identity = await verify(bearer[1]!, config!.origin + "/api-server/api/auth/engine/session"); } catch { throw denied(401); }
    if (identity?.email !== config!.principal || identity?.email_verified !== true ||
        !Number.isFinite(identity.iat) || now() - identity.iat * 1000 > 5 * 60_000 || identity.iat * 1000 > now() + 60_000) throw denied();
    const ownerUid = await owner();
    await db.runTransaction(async tx => {
      const ref = sessions.doc(req.params.id as string), data = (await tx.get(ref)).data();
      active(data);
      if (data!.status !== "pending") throw denied(409);
      tx.update(ref, { status: "approved", ownerUid, approvedAtMs: now(), approvedBy: identity.email });
    });
    res.json({ approved: true, requestId: req.params.id });
  }));
  app.post("/api/auth/engine/session/:id", wrap(async (req, res) => {
    browser(req);
    if (!validId(req.params.id)) throw denied(400);
    const cookie = (req.get("cookie") || "").split(";").map(s => s.trim()).find(s => s.startsWith("__session="))?.slice(10);
    if (!cookie || !/^fluba-engine-[a-f0-9]{64}$/.test(cookie)) throw denied();
    const verifierHash = hash(cookie.slice("fluba-engine-".length));
    const consumed = await db.runTransaction(async tx => {
      const ref = sessions.doc(req.params.id as string), data = (await tx.get(ref)).data();
      active(data);
      if (data!.verifierHash !== verifierHash) throw denied();
      if (data!.status === "pending") return null;
      const user = await auth.getUser(data!.ownerUid);
      if (!eligible(user)) throw denied(403, "Administrator access is no longer available for this account.");
      tx.update(ref, { status: "consumed", consumedAtMs: now() });
      return user.uid;
    });
    if (!consumed) { res.status(202).json({ status: "pending" }); return; }
    const customToken = await auth.createCustomToken(consumed, { authorizationEngineSession: req.params.id });
    res.clearCookie("__session", cookieOptions);
    res.json({ customToken });
  }));
}
