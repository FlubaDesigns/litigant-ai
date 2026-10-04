import crypto from "crypto";

// Longer than the API's ten-minute run timeout; recover after a crashed worker.
export const SESSION_RUN_LEASE_MS = 15 * 60 * 1000;
export interface SessionRunLease { sessionId: string; runId: string }

export class SessionRunError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function hasActiveSessionRun(session: FirebaseFirestore.DocumentData): boolean {
  return typeof session.activeRun?.id === "string" && session.activeRun.expiresAt > Date.now();
}

/** Claim the existing session before pricing/reservation, across all Cloud Run instances. */
export async function claimSessionRun(db: FirebaseFirestore.Firestore, sessionId: string, uid: string) {
  const ref = db.collection("sessions").doc(sessionId);
  const lease = { sessionId, runId: crypto.randomUUID() };
  const session = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const saved = snapshot.data();
    if (!saved || saved.userId !== uid) {
      throw new SessionRunError(403, "Session not found or access denied.");
    }
    if (hasActiveSessionRun(saved)) {
      throw new SessionRunError(409, "This session is already running in another tab. Wait for it to finish, then reload it from History.");
    }
    if (!["paused_credit_cap", "incomplete"].includes(saved.status)) {
      throw new SessionRunError(409, "This session is no longer paused. Reload it from History before continuing.");
    }
    transaction.update(ref, { activeRun: { id: lease.runId, expiresAt: Date.now() + SESSION_RUN_LEASE_MS } });
    return saved;
  });
  return { session, lease };
}

/** A stale worker must never overwrite the result of a newer run. */
export async function writeSessionRun(
  db: FirebaseFirestore.Firestore, lease: SessionRunLease, changes: FirebaseFirestore.DocumentData,
  relatedWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }> = [],
) {
  const ref = db.collection("sessions").doc(lease.sessionId);
  await db.runTransaction(async transaction => {
    const saved = (await transaction.get(ref)).data();
    if (!saved || saved.activeRun?.id !== lease.runId || !hasActiveSessionRun(saved)) {
      throw new SessionRunError(409, "This session run expired or was replaced. Reload it from History.");
    }
    transaction.update(ref, {
      ...changes, activeRun: { id: lease.runId, expiresAt: Date.now() + SESSION_RUN_LEASE_MS },
    });
    for (const write of relatedWrites) transaction.set(write.ref, write.data);
  });
}

export async function releaseSessionRun(db: FirebaseFirestore.Firestore, lease: SessionRunLease) {
  const ref = db.collection("sessions").doc(lease.sessionId);
  return db.runTransaction(async transaction => {
    const saved = (await transaction.get(ref)).data();
    // A failed/expired worker cannot clear a successor's lock.
    if (saved?.activeRun?.id !== lease.runId) return false;
    transaction.update(ref, { activeRun: null });
    return true;
  });
}
