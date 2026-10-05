/** Deployment smoke test. Temporary identities and fixtures are removed in finally; no AI calls or email. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
initializeApp({projectId:'litigant-ai'});
const db=getFirestore(), auth=getAuth();
const marker=db.collection('config_migrations').doc('guest_invitations_verified_20261005');
if((await marker.get()).exists) {console.log('Guest invitation deployment verification already completed.');process.exit(0);}
const api='https://api-781960492360.us-central1.run.app/api';
const key=process.env.VITE_FIREBASE_API_KEY;
if (!key) throw new Error('Firebase browser configuration is required for the guest verification.');
const uids=[], invitationIds=[], sessionIds=[];
async function identity(method, body) {
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok) throw new Error(`Firebase ${method} failed (${response.status}).`);
  return data;
}
async function call(path, token, method='GET', body, expected=200) {
  const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,expected,`${method} ${path.split('/').slice(0,3).join('/')} status`);
  return response.json();
}
async function anonymous() {
  const data=await identity('signUp',{returnSecureToken:true});uids.push(data.localId);return data;
}
async function makeInvite(admin, label, credits, plan) {
  const invitation=await call('/admin/guest-invitations',admin,'POST',{label,credits,plan,expiresAt:new Date(Date.now()+3600_000).toISOString()},201);
  invitationIds.push(invitation.id);return invitation.id;
}
try {
  const password=crypto.randomBytes(30).toString('base64url');
  const email=`guest-check-${crypto.randomUUID()}@example.invalid`;
  const admin=await auth.createUser({email,password,emailVerified:true});uids.push(admin.uid);
  await auth.setCustomUserClaims(admin.uid,{admin:true});
  const adminLogin=await identity('signInWithPassword',{email,password,returnSecureToken:true});
  const a=await makeInvite(adminLogin.idToken,'Deployment check A',100,'free');
  const b=await makeInvite(adminLogin.idToken,'Deployment check B',500,'pro');
  const personA=await anonymous(), personB=await anonymous(), other=await anonymous();
  await call('/guest/redeem',personA.idToken,'POST',{invitation:a});
  await call('/guest/redeem',personA.idToken,'POST',{invitation:a});
  await call('/guest/redeem',personB.idToken,'POST',{invitation:b});
  await call('/guest/redeem',other.idToken,'POST',{invitation:a},409);
  await call('/admin/guest-invitations',personA.idToken,'POST',{label:'Unauthorized'},403);
  const currentA=(await call('/guest/current',personA.idToken)).invitation;
  const currentB=(await call('/guest/current',personB.idToken)).invitation;
  assert.equal(currentA.remainingCredits,100);assert.equal(currentA.plan,'free');
  assert.equal(currentB.remainingCredits,500);assert.equal(currentB.plan,'pro');
  const sid=`guest-check-${crypto.randomUUID()}`;sessionIds.push(sid);
  await db.collection('sessions').doc(sid).set({userId:personB.localId,question:'Deployment fixture',artifacts:'Preserved fixture',transcript:'Fixture',debateNotes:'Fixture',status:'complete',config:{}});
  await call(`/sessions/${sid}`,personA.idToken,'GET',undefined,403);
  await call(`/sessions/${sid}`,personB.idToken);
  await call(`/sessions/${sid}/share`,personA.idToken,'POST',{},403);
  const shared=await call(`/sessions/${sid}/share`,personB.idToken,'POST',{});
  assert.ok(shared.shareId);
  // Link credentials to the guest identity: provisioning must preserve ownership and end Pro trial access.
  const linked=await identity('signUp',{idToken:personB.idToken,email:`guest-linked-${crypto.randomUUID()}@example.invalid`,password:crypto.randomBytes(30).toString('base64url'),returnSecureToken:true});
  assert.equal(linked.localId,personB.localId);
  await call('/auth/provision',linked.idToken,'POST',{});
  const kept=await call(`/sessions/${sid}`,linked.idToken);
  assert.equal(kept.artifacts,'Preserved fixture');
  const profile=(await db.collection('users').doc(personB.localId).get()).data();
  assert.equal(profile.guestInvitationId,null);assert.equal(profile.plan,'free');
  await db.collection('guest_invitations').doc(a).update({expiresAt:Timestamp.fromMillis(Date.now()-1000)});
  assert.equal((await call('/guest/current',personA.idToken)).invitation.status,'expired');
  await call('/sessions',personA.idToken,'GET',undefined,401);
  await call('/guest/redeem',personA.idToken,'POST',{invitation:a},410);
  console.log('Guest links verified: separate allowances, single claim, no refill, plan access, expiry, and signup ownership.');
} finally {
  for(const uid of uids) {
    for(const collection of ['credit_transactions','payment_events']) {
      const field=collection==='payment_events'?'uid':'userId';
      const rows=await db.collection(collection).where(field,'==',uid).get();
      await Promise.all(rows.docs.map(doc=>doc.ref.delete()));
    }
    await db.collection('users').doc(uid).delete();
    await auth.deleteUser(uid);
  }
  await Promise.all(invitationIds.map(id=>db.collection('guest_invitations').doc(id).delete()));
  await Promise.all(sessionIds.map(id=>db.collection('sessions').doc(id).delete()));
}

await marker.set({verifiedAt:Timestamp.now()});
