import crypto from "node:crypto";
import { Timestamp, FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

export const InvitationInput = z.object({
  label: z.string().trim().min(1).max(100),
  credits: z.number().int().min(1).max(100_000),
  plan: z.enum(["free", "pro"]),
  expiresAt: z.string().datetime().refine(value => Date.parse(value) > Date.now(), "Choose a future expiration"),
});
export class InvitationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function invitationActive(invitation: FirebaseFirestore.DocumentData | undefined, now = Date.now()): boolean {
  return !!invitation && !invitation.revoked && !invitation.convertedAt && invitation.expiresAt?.toMillis() > now;
}
export async function createInvitation(db: Firestore, input: z.infer<typeof InvitationInput>, adminUid: string) {
  const id = crypto.randomBytes(24).toString("base64url");
  await db.collection("guest_invitations").doc(id).create({
    ...input, expiresAt: Timestamp.fromDate(new Date(input.expiresAt)),
    createdAt: FieldValue.serverTimestamp(), createdBy: adminUid, claimedBy: null, revoked: false,
  });
  return id;
}
/** The transaction binds one invitation to one Firebase identity, never a browser/IP allowance. */
export async function claimInvitation(db: Firestore, id: string, uid: string) {
  const invitationRef = db.collection("guest_invitations").doc(id);
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async tx => {
    const [invitationDoc, userDoc] = await Promise.all([tx.get(invitationRef), tx.get(userRef)]);
    const invitation = invitationDoc.data();
    if (!invitationActive(invitation)) throw new InvitationError(410, "This invitation has expired or is no longer available.");
    if (invitation!.claimedBy && invitation!.claimedBy !== uid) throw new InvitationError(409, "This invitation has already been used. Continue in the browser where you started your trial.");
    const profile = userDoc.data();
    if (userDoc.exists && profile?.guestInvitationId !== id) throw new InvitationError(409, "This account already has a different invitation or a registered account.");
    if (!userDoc.exists) {
      tx.create(userRef, {
        email: "", displayName: "Guest", plan: invitation!.plan, creditBalance: 0,
        guestInvitationId: id, subscriptionStatus: "none", onboardingComplete: true,
        defaultSettings: {}, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(invitationRef, { claimedBy: uid, claimedAt: FieldValue.serverTimestamp() });
    }
    return invitation!;
  });
}
/** Linking credentials keeps the same UID, so sessions, case files and artifacts keep their owner. */
export async function convertInvitation(db: Firestore, uid: string, email: string, name?: string) {
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async tx => {
    const profile = (await tx.get(userRef)).data();
    if (!profile?.guestInvitationId) return false;
    const invitationRef = db.collection("guest_invitations").doc(profile.guestInvitationId);
    const invitation = (await tx.get(invitationRef)).data();
    if (!invitationActive(invitation) || invitation?.claimedBy !== uid) {
      throw new InvitationError(410, "The trial has expired. Create a new account to continue.");
    }
    tx.update(userRef, {
      guestInvitationId: null, plan: "free", email, displayName: name || email.split("@")[0],
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(invitationRef, { convertedAt: FieldValue.serverTimestamp() });
    return true;
  });
}
export function invitationView(id: string, data: FirebaseFirestore.DocumentData, balance?: number) {
  return {
    id, label: data.label, plan: data.plan, credits: data.credits,
    remainingCredits: balance ?? data.credits,
    expiresAt: data.expiresAt.toDate().toISOString(),
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    status: data.convertedAt ? "signed_up" : data.revoked ? "revoked" : !invitationActive(data) ? "expired" : data.claimedBy ? "claimed" : "ready",
  };
}
