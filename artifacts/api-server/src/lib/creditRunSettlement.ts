/** Durable, idempotent reservations. No provider calls or monetary charges occur here. */
import { FieldValue } from "firebase-admin/firestore";
import { canCreateArtifacts } from "@workspace/api-zod/session";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { hasActiveSessionRun, SESSION_RUN_LEASE_MS, SessionRunError, type SessionRunLease } from "./sessionRunLock.js";

function database() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Credit service unavailable");
  return db;
}
export interface CreditRunState { chargedCredits: number; targetCharge: number; reservedCredits: number; settlementStatus: "pending" | "settled"; resultStored?: boolean }

/** Reserve the complete execution allowance, not overlapping estimates. */
export async function reserveCreditRun(uid: string, budget: number, sessionId: string, runId: string,
  overdraftLimit = 0, previousCredits = 0): Promise<boolean> {
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error("Invalid execution allowance");
  const db = database(), runRef = db.collection("credit_runs").doc(runId), userRef = db.collection("users").doc(uid);
  return db.runTransaction(async tx => {
    const [run, user] = await Promise.all([tx.get(runRef), tx.get(userRef)]);
    if (run.exists) {
      const saved = run.data()!;
      if (saved.userId !== uid || saved.sessionId !== sessionId || saved.reservedCredits !== budget) throw new Error("Reservation conflicts with existing run");
      return saved.state === "active" && saved.leaseUntil > Date.now();
    }
    const profile = user.data(), balance = Number(profile?.creditBalance ?? 0);
    const debt = canCreateArtifacts(profile?.plan) ? overdraftLimit : 0;
    if ((await tx.get(db.collection("account_deletions").doc(uid))).exists) return false;
    if (!profile || balance < 0 || balance - budget < -debt) return false;
    tx.update(userRef, { creditBalance: balance - budget, updatedAt: FieldValue.serverTimestamp() });
    tx.set(runRef, { userId: uid, sessionId, runId, reservedCredits: budget, chargedCredits: budget,
      previousCredits, state: "active", leaseUntil: Date.now() + SESSION_RUN_LEASE_MS, createdAt: Date.now() });
    tx.set(db.collection("credit_transactions").doc(), { userId: uid, type: "usage", amount: -budget,
      balanceAfter: balance - budget, source: "brain_reservation", sessionId, runId, createdAt: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Save the result and refund obligation together before attempting balance settlement.
 * A pending result always reports the debit that actually committed. A crashed
 * worker can never lose the obligation or overwrite a successor's session.
 */
export async function prepareCreditRunSettlement(uid: string, runId: string, targetCharge: number,
  savedResult?: FirebaseFirestore.DocumentData, lease?: SessionRunLease | null): Promise<CreditRunState> {
  const db = database(), ref = db.collection("credit_runs").doc(runId);
  return db.runTransaction(async tx => {
    const saved = (await tx.get(ref)).data();
    if (!saved || saved.userId !== uid) throw new Error("Credit reservation not found");
    const sessionRef = db.collection("sessions").doc(saved.sessionId);
    const session = savedResult ? (await tx.get(sessionRef)).data() : undefined;
    if (!Number.isSafeInteger(targetCharge) || targetCharge < 0 || targetCharge > saved.chargedCredits) throw new Error("Invalid settlement charge");
    if (savedResult && !(saved.state === "pending" && saved.resultStored && session?.billingRunId === runId)) {
      if (saved.state !== "active" || saved.leaseUntil <= Date.now()) throw new SessionRunError(409, "This run expired. Reload the session from History.");
      if (lease && (session?.activeRun?.id !== lease.runId || !hasActiveSessionRun(session!))) throw new SessionRunError(409, "This run was replaced. Reload the session from History.");
      if (!lease && session && session.billingRunId !== runId) throw new SessionRunError(409, "This session already exists.");
    }
    if (saved.state === "settled") return { chargedCredits: saved.chargedCredits, targetCharge: saved.chargedCredits, reservedCredits: 0, settlementStatus: "settled", resultStored: saved.resultStored === true };
    if (saved.resultStored) return { chargedCredits: saved.chargedCredits, targetCharge: saved.targetCharge,
      reservedCredits: saved.chargedCredits - saved.targetCharge, settlementStatus: "pending", resultStored: true };
    // Failure recovery may only reduce an existing charge, never collect again.
    tx.set(ref, { state: "pending", targetCharge, refundSource: targetCharge === 0 ? "brain_failure_refund" : "brain_reconcile",
      settlementRequestedAt: Date.now(), ...(savedResult ? {resultStored: true} : {}) }, { merge: true });
    if (savedResult) tx.set(sessionRef, { ...savedResult, billingRunId: runId,
      creditsUsed: saved.previousCredits + targetCharge, creditsDebited: saved.previousCredits + saved.chargedCredits,
      creditsReserved: saved.chargedCredits - targetCharge, settlementStatus: "pending" }, { merge: true });
    return { chargedCredits: saved.chargedCredits, targetCharge, reservedCredits: saved.chargedCredits - targetCharge, settlementStatus: "pending", resultStored: !!savedResult };
  });
}

/** Store failure metadata with the current financial state, never a stale local
 * snapshot. Recovery can win this race without leaving a phantom pending hold. */
export async function persistCreditRunFailure(uid: string, runId: string,
  failure: FirebaseFirestore.DocumentData, lease?: SessionRunLease | null): Promise<CreditRunState> {
  const db = database(), ref = db.collection("credit_runs").doc(runId);
  return db.runTransaction(async tx => {
    const saved = (await tx.get(ref)).data();
    if (!saved || saved.userId !== uid) throw new Error("Credit reservation not found");
    const sessionRef = db.collection("sessions").doc(saved.sessionId), session = (await tx.get(sessionRef)).data();
    if (saved.resultStored) return { chargedCredits: saved.chargedCredits, targetCharge: saved.targetCharge,
      reservedCredits: saved.state === "settled" ? 0 : saved.chargedCredits - saved.targetCharge,
      settlementStatus: saved.state === "settled" ? "settled" : "pending", resultStored: true };
    const settled = saved.state === "settled";
    if (!settled) tx.set(ref,{state:"pending",targetCharge:0,refundSource:"brain_failure_refund",settlementRequestedAt:Date.now()},{merge:true});
    const ownsSession = lease ? session?.activeRun?.id === lease.runId && hasActiveSessionRun(session!)
      : !session || session.billingRunId === runId;
    if (ownsSession) tx.set(sessionRef, { ...failure, billingRunId:runId,
      creditsUsed:saved.previousCredits, creditsDebited:saved.previousCredits + saved.chargedCredits,
      creditsReserved:saved.chargedCredits, settlementStatus:settled?"settled":"pending" }, {merge:true});
    return {chargedCredits:saved.chargedCredits,targetCharge:0,reservedCredits:saved.chargedCredits,
      settlementStatus:settled?"settled":"pending"};
  });
}

/** The balance, ledger, obligation, and displayed collected cost commit atomically. */
export async function applyCreditRunSettlement(uid: string, runId: string): Promise<CreditRunState> {
  const db = database(), ref = db.collection("credit_runs").doc(runId), userRef = db.collection("users").doc(uid);
  return db.runTransaction(async tx => {
    const saved = (await tx.get(ref)).data();
    if (!saved || saved.userId !== uid) throw new Error("Credit reservation not found");
    if (saved.state === "settled") return { chargedCredits: saved.chargedCredits, targetCharge: saved.chargedCredits, reservedCredits: 0, settlementStatus: "settled", resultStored: saved.resultStored === true };
    if (saved.state === "active" && saved.leaseUntil > Date.now()) return { chargedCredits: saved.chargedCredits, targetCharge: 0, reservedCredits: saved.chargedCredits, settlementStatus: "pending" };
    const target = saved.state === "active" ? 0 : saved.targetCharge;
    if (!Number.isSafeInteger(target) || target < 0 || target > saved.chargedCredits) throw new Error("Invalid stored settlement");
    const sessionRef = db.collection("sessions").doc(saved.sessionId);
    const [user, sessionSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
    if (!user.exists) throw new Error("Account unavailable for settlement");
    const refund = saved.chargedCredits - target, balance = Number(user.data()?.creditBalance ?? 0);
    if (refund > 0) {
      tx.update(userRef, { creditBalance: balance + refund, updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection("credit_transactions").doc(), { userId: uid, type: "refund", amount: refund,
        balanceAfter: balance + refund, sessionId: saved.sessionId, runId,
        source: saved.state === "active" ? "brain_orphan_refund" : saved.refundSource, createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(ref, { state: "settled", chargedCredits: target, settledAt: Date.now() }, { merge: true });
    const session = sessionSnap.data();
    if (session?.billingRunId === runId) tx.update(sessionRef, {
      creditsUsed: saved.previousCredits + target, creditsDebited: saved.previousCredits + target, creditsReserved: 0, settlementStatus: "settled", updatedAt: FieldValue.serverTimestamp(),
    });
    return { chargedCredits: target, targetCharge: target, reservedCredits: 0, settlementStatus: "settled", resultStored: saved.resultStored === true };
  });
}

/** Retry on authenticated billing reads, before new work, and before deletion.
 * Active runs retain a lease longer than the hard execution timeout. A missing
 * session alone is never proof of an orphan. Pending obligations have no expiry.
 */
export async function recoverCreditRuns(uid: string): Promise<void> {
  const db = database();
  for (const state of ["pending", "active"]) {
    const runs = await db.collection("credit_runs").where("userId", "==", uid).where("state", "==", state).get();
    for (const run of runs.docs) {
      if (state === "active" && run.data().leaseUntil > Date.now()) continue;
      await applyCreditRunSettlement(uid, run.id);
    }
  }
}

/** A consistent available-balance snapshot for shortage notifications. */
export async function getSettledCreditBalance(uid: string): Promise<number | null> {
  const db = database();
  return db.runTransaction(async tx => {
    const [user, active, pending] = await Promise.all([
      tx.get(db.collection("users").doc(uid)),
      tx.get(db.collection("credit_runs").where("userId", "==", uid).where("state", "==", "active").limit(1)),
      tx.get(db.collection("credit_runs").where("userId", "==", uid).where("state", "==", "pending").limit(1)),
    ]);
    return user.exists && active.docs.length === 0 && pending.docs.length === 0 ? Number(user.data()?.creditBalance ?? 0) : null;
  });
}
