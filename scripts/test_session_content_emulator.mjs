import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {encodeSessionContent, decodeSessionContent} from '../lib/api-zod/src/session-content.mjs';

assert(/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? ''), 'Local emulator required');
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const {initializeApp, deleteApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const app = initializeApp({projectId:'demo-litigant-readiness'}, 'canonical-content-test');
const db = getFirestore(app);
const session = db.doc('sessions/canonical-content-test');
const settlement = db.doc('credit_runs/canonical-content-test');
const timestamp = new Date('2026-01-01T00:00:00Z');
const input = {transcript:'**Advocate:** Evidence', transcriptLines:['**Advocate:** Evidence'], debateNotes:'### Advocate — Round 1\nEvidence',
  turns:[{id:'turn_000', role:'Advocate', round:1, turnIndex:0, content:'Evidence', createdAt:timestamp}]};
try {
  await session.set({transcript:'Old text', transcriptLines:['Old text'], debateNotes:'Old notes', title:'Owner title', creditsUsed:5});
  const changes = {sessionContent:encodeSessionContent(input), transcript:FieldValue.delete(), transcriptLines:FieldValue.delete(), debateNotes:FieldValue.delete()};
  await assert.rejects(db.runTransaction(async tx => {
    await tx.get(session);
    tx.set(session, changes, {merge:true});
    tx.set(settlement, {state:'pending'});
    throw new Error('Injected failure');
  }), /Injected failure/);
  assert.equal((await session.get()).data().transcript, 'Old text');
  assert.equal((await settlement.get()).exists, false);
  await db.runTransaction(async tx => {
    await tx.get(session);
    tx.set(session, changes, {merge:true});
    tx.set(settlement, {state:'pending'});
  });
  const saved = (await session.get()).data();
  for (const field of ['transcript','transcriptLines','debateNotes']) assert(!Object.hasOwn(saved, field));
  assert.equal(saved.title, 'Owner title'); assert.equal(saved.creditsUsed, 5);
  const decoded = decodeSessionContent(saved.sessionContent);
  assert.equal(decoded.turns[0].createdAt.toDate().toISOString(), timestamp.toISOString());
  decoded.turns[0].createdAt = timestamp;
  assert.deepEqual(decoded, input);
  assert.equal((await settlement.get()).data().state, 'pending');
  // The same masked write works when creating a brand-new session.
  await session.delete(); await session.set(changes, {merge:true});
  assert.equal(decodeSessionContent((await session.get()).data().sessionContent).transcript, input.transcript);
  console.log('Canonical content emulator checks passed: atomic settlement, rollback, deletion transforms and timestamps.');
} finally {
  await session.delete(); await settlement.delete(); await db.terminate(); await deleteApp(app);
}
