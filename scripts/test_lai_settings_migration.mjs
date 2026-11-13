import assert from 'node:assert/strict';
import test from 'node:test';
import {settingsPatch, inspectSettings, migrateSettings} from './lai-settings-migration.mjs';
const root = 'projects/litigant-ai/databases/(default)/documents';
const string = value => ({stringValue: value});
const bool = value => ({booleanValue: value});
const map = fields => ({mapValue: {fields}});
const integer = value => ({integerValue: String(value)});
const doc = (path, fields) => ({name: `${root}/${path}`, fields, updateTime: '2026-01-01T00:00:00Z'});

test('migrates only retired controls, preserves current choices and is idempotent', () => {
  const before = doc('users/owner', {defaultSettings: map({outputScope: string('all-voices'),
    outputPreference: string('both'), maxIterations: integer(25), provider: string('custom')}),
    creditBalance: integer(900), displayName: string('Owner')});
  const patch = settingsPatch(before);
  assert.deepEqual(patch.updateMask.fieldPaths, ['defaultSettings']);
  assert.deepEqual(patch.currentDocument, {updateTime: before.updateTime});
  assert.deepEqual(patch.update.fields.defaultSettings, map({outputStrategy: string('consensus+individual'), maxIterations: integer(20), provider: string('custom')}));
  assert.equal(settingsPatch({...before, fields: {...before.fields, ...patch.update.fields}}), null);
  assert.equal(settingsPatch(doc('sessions/s', {config: map({outputScope: string('all-voices'), outputStrategy: string('individual')})})).update.fields.config.mapValue.fields.outputStrategy.stringValue, 'individual');
  assert.equal(settingsPatch(doc('users/empty', {defaultSettings: {mapValue: {}}})), null);
});
test('notification opt-out wins, legacy opt-in is copied only when needed', () => {
  for (const current of [true, false, undefined]) for (const legacy of [true, false]) {
    const fields = {notifySessionComplete: bool(legacy), notifications: map({other: bool(true), ...(current === undefined ? {} : {sessionComplete: bool(current)})})};
    const patch = settingsPatch(doc('users/u', fields));
    const after = {...fields, ...patch.update.fields};
    for (const key of patch.updateMask.fieldPaths) if (!(key in patch.update.fields)) delete after[key];
    assert.equal(after.notifications.mapValue.fields.sessionComplete.booleanValue, current ?? legacy);
    assert.equal(after.notifications.mapValue.fields.other.booleanValue, true);
    assert.equal(Object.hasOwn(after, 'notifySessionComplete'), false);
    assert.equal(settingsPatch(doc('users/u', after)), null);
  }
  assert.equal(settingsPatch(doc('users/u', {notifications: map({other: bool(true)})})), null);
  assert.throws(() => settingsPatch(doc('users/u', {notifySessionComplete: string('true')})), /boolean/);
});
test('limits only convert the reviewed former range and never rewrite supported values', () => {
  for (const value of [11, 20]) assert.deepEqual(settingsPatch(doc('config/adminLimits', {maxLitigants: integer(value)})).update.fields, {maxLitigants: integer(10)});
  for (const value of [2, 10, 21]) assert.equal(settingsPatch(doc('config/adminLimits', {maxLitigants: integer(value)})), null);
  for (const path of ['credit_transactions/id', 'config/keys', 'sessions/s/session_turns/t']) assert.throws(() => settingsPatch(doc(path, {})));
  assert.throws(() => settingsPatch({...doc('users/u', {}), name: 'projects/other/databases/(default)/documents/users/u'}));
  assert.throws(() => settingsPatch({...doc('users/u', {notifySessionComplete: bool(true)}), updateTime: undefined}), /precondition/);
});

function fixture() {
  const docs = new Map([
    ['users/a', doc('users/a', {notifySessionComplete: bool(true), creditBalance: integer(42)})],
    ['sessions/s', doc('sessions/s', {config: map({maxIterations: integer(25)}), finalAnswer: string('Keep answer')})],
    ['templates/t', doc('templates/t', {defaultSettings: map({outputScope: string('all-voices')}), defaultConfig: map({outputPreference: string('both')})})],
    ['config/adminLimits', doc('config/adminLimits', {maxLitigants: integer(20), overdraftLimit: integer(25)})],
  ]);
  const calls = [];
  let conflict = false;
  let checks = 0;
  const read = async url => {
    const u = new URL(url), path = u.pathname.split('/documents/')[1];
    calls.push({method: 'GET', path});
    if (path === 'config/adminLimits') return structuredClone(docs.get(path));
    assert.deepEqual(u.searchParams.getAll('mask.fieldPaths'), path === 'users' ? ['defaultSettings', 'notifications', 'notifySessionComplete'] : path === 'sessions' ? ['config'] : ['defaultConfig', 'defaultSettings']);
    return {documents: [...docs].filter(([name]) => name.startsWith(path + '/')).map(([, document]) => structuredClone(document))};
  };
  const write = async (url, label, method, body) => {
    calls.push({method, url});
    assert.equal(url, `https://firestore.googleapis.com/v1/${root}:commit`);
    assert.equal(method, 'POST');
    if (conflict) throw Object.assign(new Error('Concurrent edit'), {httpStatus: 409});
    for (const patch of body.writes) {
      const current = docs.get(patch.update.name.slice(root.length + 1));
      assert.equal(current.updateTime, patch.currentDocument.updateTime);
      for (const key of patch.updateMask.fieldPaths) {
        if (key in patch.update.fields) current.fields[key] = patch.update.fields[key];
        else delete current.fields[key];
      }
    }
    return {};
  };
  return {docs, calls, read, write, setConflict: value => {conflict = value;}, assertCurrent: async () => {checks++;}, checks: () => checks};
}
test('inspection is read-only; approved migration preserves unrelated data and supports retry', async () => {
  const f = fixture();
  assert.deepEqual((await inspectSettings(f.read)).counts, {users: 1, sessions: 1, templates: 1, config: 1});
  assert(f.calls.every(c => c.method === 'GET'));
  f.setConflict(true);
  await assert.rejects(migrateSettings(f), /Concurrent edit/);
  assert.equal(f.docs.get('users/a').fields.notifySessionComplete.booleanValue, true);
  f.setConflict(false);
  const result = await migrateSettings(f);
  assert.deepEqual(result.changed, {users: 1, sessions: 1, templates: 1, config: 1});
  assert.deepEqual(f.docs.get('users/a').fields.creditBalance, integer(42));
  assert.deepEqual(f.docs.get('sessions/s').fields.finalAnswer, string('Keep answer'));
  assert.deepEqual(f.docs.get('config/adminLimits').fields.overdraftLimit, integer(25));
  assert.deepEqual((await migrateSettings(f)).changed, {users: 0, sessions: 0, templates: 0, config: 0});
  assert(f.checks() >= 5);
});
test('authorization failure prevents all writes', async () => {
  const f = fixture();
  await assert.rejects(migrateSettings({...f, assertCurrent: async () => {throw Error('Approval moved');}}), /Approval moved/);
  assert.equal(f.calls.length, 0);
});
test('pagination is bounded and a missing optional admin document is allowed', async () => {
  const calls = [];
  const result = await inspectSettings(async url => {
    const u = new URL(url); calls.push(u);
    if (u.pathname.endsWith('/config/adminLimits')) throw Object.assign(Error('Missing'), {httpStatus: 404});
    if (u.pathname.endsWith('/users') && !u.searchParams.has('pageToken')) return {nextPageToken: 'next', documents: []};
    return {documents: []};
  });
  assert.equal(result.scanned, 0);
  assert(calls.some(u => u.searchParams.get('pageToken') === 'next'));
  await assert.rejects(inspectSettings(async () => ({nextPageToken: 'same'})), /pagination repeated/);
});
