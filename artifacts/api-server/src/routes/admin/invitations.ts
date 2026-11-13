import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { InvitationInput, createInvitation, invitationView } from "../../lib/guestInvitations.js";
import { requireAdmin } from "./shared.js";

const router = Router();


// Individual invitation links are controlled only by the administrator.
router.get("/admin/guest-invitations", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    let query = db.collection("guest_invitations").orderBy("createdAt", "desc").limit(51);
    if (typeof req.query.cursor === "string") {
      const cursor = await db.collection("guest_invitations").doc(req.query.cursor).get();
      if (!cursor.exists) return res.status(400).json({error: "This page has changed. Refresh the list."});
      query = query.startAfter(cursor);
    }
    const docs = await query.get();
    const page = docs.docs.slice(0, 50);
    const invitations = await Promise.all(page.map(async doc => {
      const data = doc.data();
      const profile = data.claimedBy ? (await db.collection("users").doc(data.claimedBy).get()).data() : null;
      return invitationView(doc.id, data, profile?.creditBalance);
    }));
    return res.json({invitations, hasMore: docs.size > 50, nextCursor: docs.size > 50 ? page.at(-1)?.id : null});
  } catch { return res.status(503).json({error: "Could not load invitations."}); }
});

router.post("/admin/guest-invitations", requireAdmin, async (req, res) => {
  const parsed = InvitationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error: "Enter a name, 1–100,000 credits, Free or Member, and a future expiration."});
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    const id = await createInvitation(db, parsed.data, (req as any).adminUid);
    return res.status(201).json({id});
  } catch { return res.status(503).json({error: "Could not create invitation."}); }
});

router.delete("/admin/guest-invitations/:id", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Invitation service unavailable."});
  try {
    await db.collection("guest_invitations").doc(req.params.id!).update({revoked: true});
    return res.json({revoked: true});
  } catch { return res.status(503).json({error: "Could not revoke invitation."}); }
});
export default router;
