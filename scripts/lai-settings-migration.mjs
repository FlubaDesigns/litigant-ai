import assert from 'node:assert/strict';

const ROOT = 'projects/litigant-ai/databases/(default)/documents';
const API = 'https://firestore.googleapis.com/v1/';
const COLLECTIONS = {
  users: ['defaultSettings', 'notifications', 'notifySessionComplete'],
  sessions: ['config'],
  templates: ['defaultConfig', 'defaultSettings'],
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function configValue(value) {
  if (value === undefined || value.nullValue !== undefined) return value;
  assert(value.mapValue, 'Saved configuration must be a map');
  const fields = structuredClone(value.mapValue.fields ?? {});
  if (fields.outputScope?.stringValue === 'all-voices'
    && (!fields.outputStrategy || fields.outputStrategy.stringValue === 'moderator-consensus')) {
    fields.outputStrategy = {stringValue: 'consensus+individual'};
  }
  delete fields.outputScope;
  delete fields.outputPreference; // Already ignored by the former runtime normalizer.
  if (Number(fields.maxIterations?.integerValue ?? fields.maxIterations?.doubleValue) === 25) fields.maxIterations = {integerValue: '20'};
  return same(value.mapValue.fields ?? {}, fields) ? value : {mapValue: {fields}};
}

/** Frozen beta-format migration, never used as an application read fallback.
 * Only named settings fields are patched; content, balances and identity stay untouched.
 */
export function settingsPatch(document) {
  assert(typeof document?.name === 'string' && document.name.startsWith(ROOT + '/'), 'Wrong settings project');
  const parts = document.name.slice(ROOT.length + 1).split('/');
  assert(parts.length === 2 && parts[1], 'Only top-level settings documents are allowed');
  const [collection, id] = parts;
  assert(Object.hasOwn(COLLECTIONS, collection) || collection === 'config' && id === 'adminLimits', 'Wrong settings collection');
  const original = document.fields ?? {};
  const fields = structuredClone(original);
  const candidates = collection === 'users' ? ['defaultSettings']
    : collection === 'sessions' ? ['config']
    : collection === 'templates' ? ['defaultConfig', 'defaultSettings'] : [];
  for (const key of candidates) if (fields[key] !== undefined) fields[key] = configValue(fields[key]);
  if (collection === 'users' && Object.hasOwn(fields, 'notifySessionComplete')) {
    const legacy = fields.notifySessionComplete;
    assert(typeof legacy.booleanValue === 'boolean', 'Legacy notification choice must be boolean');
    const current = fields.notifications;
    assert(!current || current.mapValue || current.nullValue !== undefined, 'Notification preferences must be a map');
    const prefs = structuredClone(current?.mapValue?.fields ?? {});
    // An explicit current opt-out (or opt-in) always takes precedence.
    if (typeof prefs.sessionComplete?.booleanValue !== 'boolean') prefs.sessionComplete = legacy;
    fields.notifications = {mapValue: {fields: prefs}};
    delete fields.notifySessionComplete;
  }
  if (collection === 'config') {
    const value = Number(fields.maxLitigants?.integerValue ?? fields.maxLitigants?.doubleValue);
    if (Number.isInteger(value) && value > 10 && value <= 20) fields.maxLitigants = {integerValue: '10'};
  }
  const allowed = collection === 'config' ? ['maxLitigants'] : COLLECTIONS[collection];
  const changed = allowed.filter(key => !same(original[key], fields[key]));
  if (!changed.length) return null;
  assert(typeof document.updateTime === 'string' && document.updateTime, 'Settings update precondition is missing');
  return {
    update: {name: document.name, fields: Object.fromEntries(changed.filter(key => fields[key] !== undefined).map(key => [key, fields[key]]))},
    updateMask: {fieldPaths: changed},
    currentDocument: {updateTime: document.updateTime},
  };
}

export async function inspectSettings(read) {
  const writes = [];
  const counts = {users: 0, sessions: 0, templates: 0, config: 0};
  let scanned = 0;
  for (const [collection, fields] of Object.entries(COLLECTIONS)) {
    let token;
    const seen = new Set();
    do {
      const query = new URLSearchParams({pageSize: '100'});
      for (const field of fields) query.append('mask.fieldPaths', field);
      if (token) query.set('pageToken', token);
      const page = await read(`${API}${ROOT}/${collection}?${query}`, 'inspect beta settings');
      for (const document of page.documents ?? []) {
        assert(document.name.startsWith(`${ROOT}/${collection}/`), 'Settings collection response mismatch');
        assert(++scanned <= 5000, 'Beta settings inventory exceeds reviewed bound');
        const patch = settingsPatch(document);
        if (patch) { writes.push(patch); counts[collection]++; }
      }
      token = page.nextPageToken;
      if (token) { assert(!seen.has(token), 'Settings pagination repeated'); seen.add(token); }
      assert(seen.size <= 50, 'Settings pagination exceeds reviewed bound');
    } while (token);
  }
  try {
    const document = await read(`${API}${ROOT}/config/adminLimits?mask.fieldPaths=maxLitigants`, 'inspect beta admin limit');
    assert.equal(document.name, `${ROOT}/config/adminLimits`);
    const patch = settingsPatch(document);
    if (patch) { writes.push(patch); counts.config++; }
  } catch (error) { if (error.httpStatus !== 404) throw error; }
  return {writes, counts, scanned};
}

export async function migrateSettings({read, write, assertCurrent}) {
  assert.equal(typeof assertCurrent, 'function', 'Exact-source approval recheck required');
  await assertCurrent();
  const plan = await inspectSettings(read);
  for (let offset = 0; offset < plan.writes.length; offset += 200) {
    await assertCurrent();
    // Firestore commits each bounded batch atomically. A concurrent owner edit
    // fails updateTime, leaving that batch untouched; earlier batches are retry-safe.
    await write(`${API}${ROOT}:commit`, 'migrate reviewed beta settings', 'POST', {writes: plan.writes.slice(offset, offset + 200)});
  }
  await assertCurrent();
  const after = await inspectSettings(read);
  assert.equal(after.writes.length, 0, 'Beta settings changed during migration; retry before releasing');
  return {changed: plan.counts, scanned: after.scanned};
}
