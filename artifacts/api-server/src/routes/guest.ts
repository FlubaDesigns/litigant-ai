import { Router } from "express";
import { getAuth } from "firebase-admin/auth";
import { getFirestoreDb, verifyIdToken } from "../lib/firebaseAdmin.js";
import { addCredits } from "../lib/creditLedger.js";
import { claimInvitation, InvitationError, invitationView } from "../lib/guestInvitations.js";
import { makeRateLimiter } from "../lib/rateLimiter.js";

const router = Router();
const limiter = makeRateLimiter({keyFn: req => `invitation:${req.ip ?? "unknown"}`, limit: 30, windowMs: 60 * 60 * 1000, message: "Please wait before trying again."});
router.post("/guest/redeem", limiter, async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const decoded = token ? await verifyIdToken(token, { allowUnclaimedGuest: true, allowExpiredGuest: true }) : null;
  if (!decoded?.anonymous) return res.status(401).json({error: "Start a guest trial to use this invitation."});
  const id = req.body?.invitation;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(id)) return res.status(400).json({error: "Invalid invitation link."});
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    // Keep the marker through credential linking until provisioning completes.
    await getAuth().setCustomUserClaims(decoded.uid, { guestTrial: true });
    const invitation = await claimInvitation(db, id, decoded.uid);
    await addCredits(decoded.uid, invitation.credits, "admin_adjustment", {
      source: "guest_invitation", idempotencyKey: `guest_invitation_${id}`,
    });
    return res.json({redeemed: true});
  } catch (error) {
    return res.status(error instanceof InvitationError ? error.status : 503).json({error: error instanceof InvitationError ? error.message : "Could not start the trial. Please try again."});
  }
});
router.get("/guest/current", async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const decoded = token ? await verifyIdToken(token, {allowExpiredGuest: true, allowUnclaimedGuest: true}) : null;
  if (!decoded) return res.status(401).json({error: "Unauthorized"});
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    const profile = (await db.collection("users").doc(decoded.uid).get()).data();
    if (!profile?.guestInvitationId) return res.json({invitation: null});
    const invitation = (await db.collection("guest_invitations").doc(profile.guestInvitationId).get()).data();
    return res.json({invitation: invitation ? invitationView(profile.guestInvitationId, invitation, profile.creditBalance) : null});
  } catch { return res.status(503).json({error: "Could not load your invitation."}); }
});
export default router;
