import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { CREDITS_PER_DOLLAR, AUTO_REFILL_CONSENT_VERSION } from "@workspace/api-zod/billing";
import { isSquareConfigured, getSquareLocationId, getSquarePayment, findSquareRefillPayment, createSquareCustomer, saveSquareCard, disableSquareCard, chargeSquareCard, SquareApiError, type SquarePayment } from "./squareClient.js";

const key = (value:string) => crypto.createHash("sha256").update(value).digest("hex").slice(0,40);
function database() { const db=getFirestoreDb(); if(!db) throw new Error("Billing is unavailable."); return db; }
export function eligibleCardPayment(payment:SquarePayment, uid:string, now=Date.now()) {
  const owner=payment.note?.match(/LITIGANT:userId=([^,]+)/)?.[1];
  const authorized=Date.parse(payment.card_details?.created_at ?? payment.created_at ?? "");
  return owner===uid && payment.status==="COMPLETED" && payment.card_details?.status==="CAPTURED"
    && payment.card_details?.entry_method==="KEYED" && Number.isFinite(authorized)
    && authorized<=now && now-authorized<86400000;
}

export async function getAutoRefillStatus(uid:string) {
  await reconcileAutoRefillAttempt(uid);
  const db=database();
  const [account,user]=await Promise.all([db.collection("billing_accounts").doc(uid).get(),db.collection("users").doc(uid).get()]);
  const data=account.data()??{}, pref=user.data()?.autoRefill;
  const recent=data.recentCardPayment;
  return {available:isSquareConfigured(), enabled:pref?.enabled===true && pref?.consentVersion===AUTO_REFILL_CONSENT_VERSION,
    card:data.cardId ? {brand:data.cardBrand,last4:data.cardLast4} : null,
    recentCard:recent && recent.authorizedAt>Date.now()-86400000 ? {brand:recent.brand,last4:recent.last4} : null,
    status:data.refillStatus??"idle", error:data.refillError??null};
}

/** Validate against the immutable authorization before either granting credits or
 * clearing an attempt. Terminal events must never settle someone else's charge. */
export async function validateRefillPayment(uid: string, payment: SquarePayment) {
  const attemptId = payment.note?.match(/,refill=([a-f0-9-]+)(?:,|$)/)?.[1];
  if (!attemptId) return null;
  const attempt = (await database().collection("auto_refill_attempts").doc(attemptId).get()).data();
  if (!attempt || attempt.uid !== uid || attempt.request.note !== payment.note
    || attempt.request.amount_money.amount !== Number(payment.amount_money?.amount)
    || attempt.request.amount_money.currency !== payment.amount_money?.currency
    || attempt.request.location_id !== payment.location_id
    || (attempt.paymentId && attempt.paymentId !== payment.id)) {
    throw new Error("Top-up payment does not match its authorization.");
  }
  return attemptId;
}

export async function recordRefillPayment(uid:string, payment:SquarePayment) {
  const attemptId = await validateRefillPayment(uid, payment);
  if (!attemptId && !eligibleCardPayment(payment,uid)) return;
  const db=database(), account=db.collection("billing_accounts").doc(uid);
  if(attemptId) {
    if (!["COMPLETED", "FAILED", "CANCELED"].includes(payment.status)) return;
    const ref=db.collection("auto_refill_attempts").doc(attemptId), user=db.collection("users").doc(uid);
    await db.runTransaction(async tx=>{
      const [attemptSnap,accountSnap,userSnap]=await Promise.all([tx.get(ref),tx.get(account),tx.get(user)]);
      const deletion = (await tx.get(db.collection("account_deletions").doc(uid))).data();
      if (!userSnap.exists || (deletion && deletion.phase !== "preparing")) throw new Error("Account unavailable for payment recording.");
      const attempt=attemptSnap.data();
      if (!attempt || attempt.uid !== uid || (attempt.paymentId && attempt.paymentId !== payment.id)) throw new Error("Top-up payment changed during reconciliation.");
      // A delayed failed webhook cannot undo a completed credit delivery.
      if (attempt.status === "completed" && payment.status !== "COMPLETED") return;
      const completed=payment.status === "COMPLETED";
      tx.set(ref,{status:completed?"completed":payment.status.toLowerCase(),paymentId:payment.id,completedAt:Date.now()},{merge:true});
      if(accountSnap.data()?.activeAttempt===attemptId) {
        tx.set(account,{activeAttempt:null,refillStatus:completed?"completed":"failed",refillError:completed?null:"Automatic top-up failed and is off. Check your card or use manual checkout."},{merge:true});
        if (!completed && userSnap.exists) tx.update(user,{"autoRefill.enabled":false});
      }
    });
  } else if(eligibleCardPayment(payment,uid)) {
    await db.runTransaction(async tx => {
      const [user, deletion] = await Promise.all([tx.get(db.collection("users").doc(uid)), tx.get(db.collection("account_deletions").doc(uid))]);
      if (!user.exists || (deletion.exists && deletion.data()?.phase !== "preparing")) return;
      tx.set(account,{recentCardPayment:{id:payment.id,authorizedAt:Date.parse(payment.card_details?.created_at ?? payment.created_at!),brand:payment.card_details?.card?.card_brand??"Card",last4:payment.card_details?.card?.last_4??""}},{merge:true});
    });
  }
}

/** Recover only the existing attempt. This read/status path NEVER creates a charge. */
export async function reconcileAutoRefillAttempt(uid: string) {
  if (!isSquareConfigured()) return;
  const db=database(), account=db.collection("billing_accounts").doc(uid);
  const attempt = await db.runTransaction(async tx => {
    const billing=(await tx.get(account)).data();
    if (!billing?.activeAttempt) return null;
    const ref=db.collection("auto_refill_attempts").doc(billing.activeAttempt);
    const saved=(await tx.get(ref)).data();
    if (!saved || saved.uid !== uid) throw new Error("Top-up authorization requires reconciliation.");
    if (["completed", "failed", "canceled"].includes(saved.status)) {
      tx.set(account,{activeAttempt:null,refillStatus:saved.status === "completed" ? "completed" : "failed"},{merge:true});
      return null;
    }
    if (saved.leaseUntil > Date.now()) return null;
    tx.set(ref,{leaseUntil:Date.now()+120000},{merge:true});
    return {...saved,id:billing.activeAttempt};
  });
  if (!attempt) return;
  const saved=attempt as Record<string,any>;
  const markPending = async (message: string) => db.runTransaction(async tx => {
    const current = (await tx.get(account)).data();
    if (current?.activeAttempt === saved.id) tx.set(account,{refillStatus:"pending",refillError:message},{merge:true});
  });
  try {
    const payment = saved.paymentId ? await getSquarePayment(saved.paymentId)
      : await findSquareRefillPayment(saved.id, saved.createdAt, saved.request.location_id);
    if (!payment) {
      await markPending("Top-up confirmation is pending. No new charge will start; contact support if this persists.");
      return;
    }
    await validateRefillPayment(uid,payment);
    await db.collection("auto_refill_attempts").doc(saved.id).set({paymentId:payment.id},{merge:true});
    const {handleSquareEvent}=await import("./squareEventHandler.js");
    await handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:`refill_recovery_${payment.id}`,data:{object:{payment}}});
  } catch (error) {
    // A failed status lookup is not proof that the charge failed.
    await markPending("Could not confirm the existing top-up. Refresh to retry; no new top-up has been started.");
    throw error;
  }
}

export async function setAutoRefillPreference(uid:string, opts:{enabled:boolean;thresholdCredits:number;dollarAmount:number;warningThresholdCredits?:number;consent?:boolean;useRecentCard?:boolean}) {
  const db=database(), user=db.collection("users").doc(uid), account=db.collection("billing_accounts").doc(uid);
  const current=(await user.get()).data();
  if (!current) throw new Error("Account profile is unavailable.");
  if ((await db.collection("account_deletions").doc(uid).get()).exists) throw new Error("Account deletion is pending.");
  if(!opts.enabled) {
    await db.runTransaction(async tx => {
      const [latest, deletion] = await Promise.all([tx.get(user), tx.get(db.collection("account_deletions").doc(uid))]);
      if (!latest.exists || deletion.exists) throw new Error("Account deletion is pending or the profile is unavailable.");
      tx.update(user,{autoRefill:{enabled:false,thresholdCredits:opts.thresholdCredits,dollarAmount:opts.dollarAmount,warningThresholdCredits:opts.warningThresholdCredits??latest.data()?.autoRefill?.warningThresholdCredits??0,consentVersion:0,revision:crypto.randomUUID()},autoRefillCheckoutUrl:FieldValue.delete(),autoRefillTriggeredAt:FieldValue.delete()});
    });
    return;
  }
  if(!isSquareConfigured()) throw new Error("Square is unavailable. Use manual checkout for now.");
  if(current.guestInvitationId || current.banned) throw new Error("This account cannot enable automatic payments.");
  const previous=current.autoRefill;
  const sameConsent=previous?.enabled===true && previous.consentVersion===AUTO_REFILL_CONSENT_VERSION && previous.dollarAmount===opts.dollarAmount && previous.thresholdCredits===opts.thresholdCredits;
  if(!sameConsent && opts.consent!==true) throw new Error("Authorize the displayed amount and threshold before enabling automatic payments.");
  async function saveBilling(data: Record<string, unknown>) {
    await db.runTransaction(async tx => {
      const [profile, deletion] = await Promise.all([tx.get(user), tx.get(db.collection("account_deletions").doc(uid))]);
      if (!profile.exists || deletion.exists) throw new Error("Account deletion is pending or the profile is unavailable.");
      tx.set(account, data, { merge: true });
    });
  }
  let data=(await account.get()).data()??{};
  if(!data.cardId || opts.useRecentCard) {
    if(opts.consent!==true || !data.recentCardPayment?.id) throw new Error("Buy credits with a credit or debit card, then enable Auto Top-Up within 24 hours.");
    const payment=await getSquarePayment(data.recentCardPayment.id);
    if(!eligibleCardPayment(payment,uid) || payment.location_id!==getSquareLocationId()) throw new Error("That payment cannot be used to save a card. Use a recent credit-card checkout, not a digital wallet.");
    const customer=data.customerId ? {id:data.customerId} : await createSquareCustomer(uid,current.email,key(`customer:${uid}`));
    // Persist explicit authorization before asking Square to store the card.
    await saveBilling({customerId:customer.id,cardStorageConsentAt:Date.now(),cardStorageConsentVersion:AUTO_REFILL_CONSENT_VERSION});
    const card=await saveSquareCard(payment.id,customer.id,key(`card:${uid}:${payment.id}`));
    data={...data,customerId:customer.id,cardId:card.id,cardBrand:card.card_brand??"Card",cardLast4:card.last_4??""};
    try { await saveBilling({customerId:data.customerId,cardId:data.cardId,cardBrand:data.cardBrand,cardLast4:data.cardLast4}); }
    catch (error) {
      // Deletion may have won while Square saved the card. Do not restore billing
      // data or leave the newly saved card enabled after the owner's deletion.
      await disableSquareCard(card.id);
      throw error;
    }
  }
  await db.runTransaction(async tx=>{
    const snapshot = await tx.get(user);
    if (!snapshot.exists) throw new Error("Account profile is unavailable.");
    const latest=snapshot.data()!;
    if(latest.autoRefill?.revision!==current.autoRefill?.revision) throw new Error("Auto Top-Up changed in another window. Reload before enabling it.");
    if((await tx.get(db.collection("account_deletions").doc(uid))).exists || latest.banned || latest.guestInvitationId) throw new Error("This account cannot enable automatic payments.");
    tx.set(user,{autoRefill:{enabled:true,thresholdCredits:opts.thresholdCredits,dollarAmount:opts.dollarAmount,
      warningThresholdCredits:opts.warningThresholdCredits??latest.autoRefill?.warningThresholdCredits??0,
      consentVersion:AUTO_REFILL_CONSENT_VERSION,consentAt:Date.now(),revision:crypto.randomUUID()},autoRefillCheckoutUrl:FieldValue.delete(),autoRefillTriggeredAt:FieldValue.delete()},{merge:true});
    tx.set(account,{refillError:null},{merge:true});
  });
}

export async function removeAutoRefillCard(uid:string) {
  const db=database(), account=db.collection("billing_accounts").doc(uid), user=db.collection("users").doc(uid);
  if((await user.get()).exists) await user.update({"autoRefill.enabled":false,"autoRefill.consentVersion":0,"autoRefill.revision":crypto.randomUUID()});
  const data=(await account.get()).data();
  if(data?.cardId) await disableSquareCard(data.cardId);
  await account.set({cardId:null,cardBrand:null,cardLast4:null,recentCardPayment:null},{merge:true});
}

/** One authorized charge per completed run; concurrent runs share a durable attempt and Square idempotency key. */
export async function checkAndTriggerAutoRefill(uid:string, _newBalance:number, sessionId:string) {
  if(!isSquareConfigured()) return;
  const db=database(), user=db.collection("users").doc(uid), account=db.collection("billing_accounts").doc(uid);
  const proposedId=crypto.randomUUID(), now=Date.now();
  const attempt: {id:string;paymentId?:string;request:Record<string,unknown>} | null=await db.runTransaction(async tx=>{
    const [u,a]=await Promise.all([tx.get(user),tx.get(account)]);
    const profile=u.data(), billing=a.data(), pref=profile?.autoRefill;
    const deleting = (await tx.get(db.collection("account_deletions").doc(uid))).exists;
    const mayCharge = !deleting && pref?.enabled && pref.consentVersion===AUTO_REFILL_CONSENT_VERSION && !profile?.banned && !profile?.guestInvitationId && billing?.cardId;
    if(billing?.activeAttempt) {
      const ref=db.collection("auto_refill_attempts").doc(billing.activeAttempt), saved=(await tx.get(ref)).data();
      if(!saved || ["completed","failed","canceled"].includes(saved.status) || saved.leaseUntil>now) return null;
      if (!saved.paymentId && !mayCharge) return null;
      tx.set(ref,{leaseUntil:now+120000},{merge:true});
      return {...saved,id:billing.activeAttempt,request:saved.request,paymentId:saved.paymentId};
    }
    if (!mayCharge) return null;
    if(billing!.lastTriggerSession===sessionId || Number(profile?.creditBalance)>=pref.thresholdCredits) return null;
    // A reservation makes credits unavailable temporarily; it is not completed
    // usage and must never cause a saved-card charge. Existing attempts above
    // remain recoverable regardless of this new-charge guard.
    const outstanding = await Promise.all(["active", "pending"].map(state => tx.get(
      db.collection("credit_runs").where("userId", "==", uid).where("state", "==", state))));
    if (outstanding.some(snapshot => !snapshot.empty && snapshot.docs.length > 0)) return null;
    const cents=Math.round(pref.dollarAmount*100), credits=cents*CREDITS_PER_DOLLAR/100;
    if(!Number.isSafeInteger(cents) || cents<100 || cents>50000 || !Number.isSafeInteger(credits)) return null;
    const request={idempotency_key:proposedId,source_id:billing!.cardId,customer_id:billing!.customerId,location_id:getSquareLocationId(),
      amount_money:{amount:cents,currency:"USD"},autocomplete:true,customer_details:{customer_initiated:false,seller_keyed_in:false},
      note:`LITIGANT:userId=${uid},creditAmount=${credits},pack=custom,type=auto_refill,refill=${proposedId}`};
    const saved={uid,request,credits,status:"pending",consentAt:pref.consentAt,sessionId,createdAt:now,leaseUntil:now+120000};
    tx.set(db.collection("auto_refill_attempts").doc(proposedId),saved);
    tx.set(account,{activeAttempt:proposedId,lastTriggerSession:sessionId,refillStatus:"pending",refillError:null},{merge:true});
    return {...saved,id:proposedId};
  });
  if(!attempt) return;
  try {
    const payment=attempt.paymentId ? await getSquarePayment(attempt.paymentId) : await chargeSquareCard(attempt.request);
    await db.collection("auto_refill_attempts").doc(attempt.id).set({paymentId:payment.id},{merge:true});
    if (["COMPLETED", "FAILED", "CANCELED"].includes(payment.status)) {
      const {handleSquareEvent}=await import("./squareEventHandler.js");
      await handleSquareEvent({merchant_id:"",type:"payment.updated",event_id:`refill_${payment.id}`,data:{object:{payment}}});
    }
  } catch(error) {
    const terminal=!attempt.paymentId && error instanceof SquareApiError && error.status>=400 && error.status<500 && error.status!==429;
    const message=terminal ? "Automatic top-up failed and is off. Check your card or use manual checkout." : "Top-up confirmation is pending. No new top-up will start until this payment is resolved.";
    await db.runTransaction(async tx=>{
      const a=await tx.get(account);
      if(a.data()?.activeAttempt!==attempt.id) return;
      tx.set(account,{refillStatus:terminal?"failed":"pending",refillError:message,...(terminal?{activeAttempt:null}:{})},{merge:true});
      if(terminal) {tx.update(user,{"autoRefill.enabled":false});tx.set(db.collection("auto_refill_attempts").doc(attempt.id),{status:"failed"},{merge:true});}
    });
  }
}
