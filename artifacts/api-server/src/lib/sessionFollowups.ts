import crypto from "node:crypto";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { getSettledCreditBalance } from "./creditRunSettlement.js";
import { checkAndTriggerAutoRefill } from "./creditLedger.js";
import { getBillingDefaults } from "./billingDefaultsConfig.js";
import { sessionCompleteNotificationsEnabled } from "@workspace/api-zod/session";
import {
  sendTrackedEmail,
  sendLowCreditsEmail,
  sendSessionCompleteEmail,
  sendFirstSessionEmail,
  sendZeroCreditsEmail,
  isResendConfigured,
} from "./emailService.js";

export type SessionFollowup = {
  userId: string;
  sessionId: string;
  runId: string;
  creditRun: boolean;
  cancelled: boolean;
  fullAccess: boolean;
  sessionStatus: string;
  title: string;
  actualCost: number;
};

/** Saved atomically with the result. Processing stays inside an HTTP request;
 * interrupted work remains queued for the next authenticated recovery request. */
export async function processSessionFollowup(
  uid: string,
  runId: string,
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  const ref = db.collection("session_followups").doc(runId),
    claim = crypto.randomUUID();
  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref),
      data = snap.data();
    const fence = await tx.get(db.collection("account_deletions").doc(uid));
    const user = await tx.get(db.collection("users").doc(uid));
    if (
      !data ||
      data.userId !== uid ||
      data.state === "complete" ||
      data.leaseUntil > Date.now() ||
      fence.exists ||
      !user.exists
    )
      return null;
    const run = data.creditRun
      ? (await tx.get(db.collection("credit_runs").doc(runId))).data()
      : null;
    if (data.creditRun && !run) return null;
    tx.update(ref, {
      state: "pending",
      claim,
      leaseUntil: Date.now() + 5 * 60_000,
    });
    return {
      ...data,
      settled: !data.creditRun || run?.state === "settled",
    } as SessionFollowup & { settled: boolean };
  });
  if (!job) return;
  let complete = false;
  try {
    const settled = job.settled;
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() ?? {};
    let newBalance = (userData.creditBalance as number) ?? 0;

    await db
      .collection("users")
      .doc(uid)
      .update({ lastSessionAt: Date.now() })
      .catch((e) =>
        console.error("[brain] lastSessionAt update failed (non-fatal):", e),
      );

    if (!job.cancelled && settled)
      await checkAndTriggerAutoRefill(uid, newBalance, job.sessionId);
    newBalance =
      (await db.collection("users").doc(uid).get()).data()?.creditBalance ??
      newBalance;

    if (job.fullAccess && job.sessionStatus === "complete")
      await db.runTransaction(async (tx) => {
        const ref = db.collection("users").doc(uid);
        const profile = (await tx.get(ref)).data();
        if (profile && !profile.firstCompletedSessionId)
          tx.update(ref, { firstCompletedSessionId: job.sessionId });
      });

    if (await isResendConfigured()) {
      const billingDefaults = await getBillingDefaults();
      const emailThreshold = billingDefaults.emailCreditWarningThreshold;

      const notifications: Promise<boolean>[] = [];
      const settledBalance = await getSettledCreditBalance(uid);
      if (
        settledBalance !== null &&
        emailThreshold > 0 &&
        settledBalance > 0 &&
        settledBalance < emailThreshold
      )
        notifications.push(
          sendTrackedEmail(
            uid,
            "lowCredits",
            (key) =>
              sendLowCreditsEmail(uid, settledBalance!, emailThreshold, key),
            { sentField: "lowCreditEmailSentAt", cooldownMs: 86400_000 },
          ),
        );
      const notificationProfile =
        (await db.collection("users").doc(uid).get()).data() ?? {};
      if (
        job.fullAccess &&
        job.sessionStatus === "complete" &&
        sessionCompleteNotificationsEnabled(notificationProfile) &&
        job.sessionId
      ) {
        if (notificationProfile.firstCompletedSessionId === job.sessionId) {
          notifications.push(
            sendTrackedEmail(
              uid,
              "firstSession",
              (key) =>
                sendFirstSessionEmail(uid, job.sessionId, job.title, key),
              { sentField: "firstSessionEmailSent" },
            ),
          );
        } else {
          notifications.push(
            sendTrackedEmail(
              uid,
              "sessionComplete",
              (key) =>
                sendSessionCompleteEmail(
                  uid,
                  job.sessionId,
                  job.title,
                  job.actualCost,
                  key,
                ),
              { eventId: job.sessionId },
            ),
          );
        }
      }
      if (settledBalance !== null && settledBalance <= 0)
        notifications.push(
          sendTrackedEmail(
            uid,
            "zeroCredits",
            (key) => sendZeroCreditsEmail(uid, key),
            { sentField: "zeroCreditsEmailSentAt", cooldownMs: 86400_000 },
          ),
        );
      const outcomes = await Promise.allSettled(notifications);
      if (outcomes.some((outcome) => outcome.status === "rejected"))
        throw new Error("Notification delivery pending");
    }
    complete = settled;
  } catch {
    console.error("[followups] Follow-up remains pending", { runId });
  } finally {
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (data?.claim === claim) {
        if (complete) tx.delete(ref);
        else tx.update(ref, { leaseUntil: 0, updatedAt: Date.now() });
      }
    });
  }
}

export async function recoverSessionFollowups(uid: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  const jobs = await db
    .collection("session_followups")
    .where("userId", "==", uid)
    .limit(10)
    .get();
  for (const job of jobs.docs) await processSessionFollowup(uid, job.id);
}
