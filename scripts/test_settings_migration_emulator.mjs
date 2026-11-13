import assert from 'node:assert/strict';
import {inspectSettings, migrateSettings} from './lai-settings-migration.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;
assert(host && /^(127\.0\.0\.1|localhost):\d+$/.test(host), 'Local Firestore emulator required');
const liveRoot = 'https://firestore.googleapis.com/v1/projects/litigant-ai/databases/(default)/documents';
const testRoot = `http://${host}/v1/projects/demo-litigant-readiness/databases/(default)/documents`;
const name = id => 'projects/litigant-ai/databases/(default)/documents/' + id;
const integer = value => ({integerValue: String(value)});
const map = fields => ({mapValue: {fields}});
async function call(url, _label, method = 'GET', body) {
  assert(url.startsWith(liveRoot), 'Unexpected migration URL');
  const encoded = body ? JSON.stringify(body).replaceAll('projects/litigant-ai/', 'projects/demo-litigant-readiness/') : undefined;
  const response = await fetch(url.replace(liveRoot, testRoot), {method, headers: {'Authorization': 'Bearer owner', 'Content-Type': 'application/json'}, body: encoded});
  const value = await response.json();
  if (!response.ok) throw Object.assign(Error(`Emulator HTTP ${response.status}`), {httpStatus: response.status});
  return JSON.parse(JSON.stringify(value).replaceAll('projects/demo-litigant-readiness/', 'projects/litigant-ai/'));
}
const owner = 'users/settings-migration-owner';
const session = 'sessions/settings-migration-session';
await call(liveRoot + ':commit', '', 'POST', {writes: [
  {update: {name: name(owner), fields: {defaultSettings: map({maxIterations: integer(25), outputScope: {stringValue: 'all-voices'}}),
    notifySessionComplete: {booleanValue: true}, notifications: map({sessionComplete: {booleanValue: false}}), creditBalance: integer(42)}}},
  {update: {name: name(session), fields: {config: map({maxIterations: integer(25)}), finalAnswer: {stringValue: 'Preserve answer'}}}},
]});
const plan = await inspectSettings(call);
const ownerWrite = plan.writes.find(write => write.update.name === name(owner));
const sessionWrite = plan.writes.find(write => write.update.name === name(session));
assert(ownerWrite && sessionWrite);
// Simulate an owner save after inventory but before its atomic commit.
await call(`${liveRoot}/${owner}?updateMask.fieldPaths=defaultSettings.provider`, '', 'PATCH',
  {fields: {defaultSettings: map({provider: {stringValue: 'owner-provider'}})}});
await assert.rejects(call(liveRoot + ':commit', '', 'POST', {writes: [ownerWrite, sessionWrite]}),
  error => [400, 409, 412].includes(error.httpStatus));
assert.equal((await call(`${liveRoot}/${session}`)).fields.config.mapValue.fields.maxIterations.integerValue, '25');
await migrateSettings({read: call, write: call, assertCurrent: async () => {}});
const after = (await call(`${liveRoot}/${owner}`)).fields;
assert.equal(after.defaultSettings.mapValue.fields.maxIterations.integerValue, '20');
assert.equal(after.defaultSettings.mapValue.fields.outputStrategy.stringValue, 'consensus+individual');
assert.equal(after.defaultSettings.mapValue.fields.provider.stringValue, 'owner-provider');
assert.equal(after.notifications.mapValue.fields.sessionComplete.booleanValue, false);
assert(!Object.hasOwn(after, 'notifySessionComplete'));
assert.equal(after.creditBalance.integerValue, '42');
assert.equal((await call(`${liveRoot}/${session}`)).fields.finalAnswer.stringValue, 'Preserve answer');
assert.equal((await inspectSettings(call)).writes.length, 0);
console.log('Settings migration emulator checks passed: atomic conflict, retry, opt-out and unrelated fields preserved.');
