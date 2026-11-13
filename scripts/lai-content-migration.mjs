import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {encodeSessionContent, decodeSessionContent} from '../lib/api-zod/src/session-content.mjs';

const ROOT = 'projects/litigant-ai/databases/(default)/documents';
const API = 'https://firestore.googleapis.com/v1/';
const SEP = '\n\n---\n\n';
const string = stringValue => ({stringValue});
const integer = value => ({integerValue:String(value)});
const map = fields => ({mapValue:{fields}});
const array = values => ({arrayValue:{values}});
const fields = value => value?.mapValue?.fields ?? {};
function text(value, fallback = '') {
  if (value === undefined) return fallback;
  assert.equal(typeof value.stringValue, 'string', 'Saved content must be text');
  return value.stringValue;
}
function number(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value.integerValue ?? value.doubleValue);
  assert(Number.isSafeInteger(parsed), 'Saved turn index/round must be an integer');
  return parsed;
}
function sessionName(name) {
  assert(typeof name === 'string' && name.startsWith(ROOT + '/sessions/'), 'Wrong content project/collection');
  assert.equal(name.slice(ROOT.length + 1).split('/').length, 2, 'Only root sessions may be migrated');
}

/** Metadata stays in its original Firestore wire representation, including
 * timestamps, references and byte values. Only content strings are interned.
 */
function wireRecord(record, turnMetadata) {
  const view = refs => array(refs.map(ref => map({block:integer(ref.block), prefix:string(ref.prefix)})));
  return map({version:integer(1), blocks:array(record.blocks.map(string)), transcript:view(record.transcript),
    context:view(record.context), notes:view(record.notes), turns:array(record.turns.map((turn, index) =>
      map({block:integer(turn.block), metadata:map(turnMetadata[index])})))});
}
function plainRecord(value) {
  assert(value?.mapValue, 'Canonical record must be a map');
  const saved = fields(value);
  for (const key of ['blocks','transcript','context','notes','turns']) assert(saved[key]?.arrayValue, 'Canonical array missing');
  const view = value => (value?.arrayValue?.values ?? []).map(item => {
    const ref = fields(item);
    assert.equal(typeof ref.prefix?.stringValue, 'string', 'Canonical prefix missing');
    return {block:number(ref.block), prefix:text(ref.prefix)};
  });
  return {version:number(saved.version), blocks:(saved.blocks?.arrayValue?.values ?? []).map(item => text(item)),
    transcript:view(saved.transcript), context:view(saved.context), notes:view(saved.notes),
    turns:(saved.turns?.arrayValue?.values ?? []).map(item => {
      const turn = fields(item);
      assert(turn.metadata?.mapValue, 'Canonical turn metadata missing');
      return {block:number(turn.block), metadata:fields(turn.metadata)};
    })};
}

export function contentPlan(document, turnDocuments, now = Date.now()) {
  sessionName(document?.name);
  const saved = document.fields ?? {};
  assert(document.updateTime, 'Session update precondition required');
  assert(saved.status?.stringValue !== 'deleting', 'Session deletion in progress; retry migration');
  const active = fields(saved.activeRun);
  assert(!active.id?.stringValue || number(active.expiresAt, Infinity) <= now, 'Session still running; retry migration');
  const prefix = document.name + '/session_turns/';
  for (const turn of turnDocuments) {
    assert(turn.name.startsWith(prefix) && !turn.name.slice(prefix.length).includes('/'), 'Wrong turn collection');
    assert(turn.updateTime, 'Turn update precondition required');
    assert.equal(typeof turn.fields?.content?.stringValue, 'string', 'Saved turn body must be text');
  }
  const sorted = [...turnDocuments].sort((a,b) => number(a.fields?.turnIndex, Number.MAX_SAFE_INTEGER) - number(b.fields?.turnIndex, Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name));
  if (saved.memorySaved?.booleanValue === false) {
    assert(!saved.sessionContent && !saved.transcript && !saved.transcriptLines && !saved.debateNotes && sorted.length === 0,
      'Free session unexpectedly contains memory; manual reconciliation required');
    return {patch:null, deletes:[]};
  }
  let canonical = saved.sessionContent;
  let patch = null;
  if (canonical === undefined) {
    const turns = sorted.map(turn => ({id:turn.name.slice(prefix.length), content:text(turn.fields?.content),
      role:turn.fields?.role === undefined ? undefined : text(turn.fields.role), round:number(turn.fields?.round, undefined)}));
    const transcript = text(saved.transcript) || turns.filter(turn => turn.role !== 'Orchestrator')
      .map(turn => `**${turn.role} (Round ${turn.round}):**\n${turn.content}`).join(SEP);
    const debateNotes = text(saved.debateNotes) || turns.filter(turn => turn.role !== 'Orchestrator' && turn.role !== 'Verdict')
      .map(turn => `### ${turn.role} — Round ${turn.round}\n${turn.content}`).join(SEP);
    let transcriptLines;
    if (saved.transcriptLines !== undefined) {
      assert(saved.transcriptLines.arrayValue, 'Saved resume context must be an array');
      transcriptLines = (saved.transcriptLines.arrayValue.values ?? []).map(value => text(value));
    }
    const input = {transcript, transcriptLines:transcriptLines ?? transcript.split(SEP).filter(Boolean), debateNotes,
      turns:turns.map(turn => ({id:turn.id, content:turn.content}))};
    const record = encodeSessionContent(input);
    assert.deepEqual(decodeSessionContent(record), input, 'Content conversion changed text');
    const metadata = sorted.map(turn => {
      const {content:_content, ...retained} = turn.fields ?? {};
      return {...retained, id:string(turn.name.slice(prefix.length))};
    });
    canonical = wireRecord(record, metadata);
    patch = {update:{name:document.name, fields:{sessionContent:canonical}},
      updateMask:{fieldPaths:['sessionContent','transcript','transcriptLines','debateNotes']},
      currentDocument:{updateTime:document.updateTime}};
  } else {
    assert(!saved.transcript && !saved.transcriptLines && !saved.debateNotes, 'Canonical session has unexpected root copies');
  }
  const decoded = decodeSessionContent(plainRecord(canonical));
  const byId = new Map(decoded.turns.map(turn => [text(turn.id), turn]));
  assert.equal(byId.size, decoded.turns.length, 'Duplicate canonical turn identity');
  const deletes = sorted.map(turn => {
    const {content, ...metadata} = turn.fields ?? {};
    const canonicalTurn = byId.get(turn.name.slice(prefix.length));
    assert(canonicalTurn, 'Old turn is absent from canonical record');
    const {content:canonicalText, id:_id, ...canonicalMetadata} = canonicalTurn;
    assert.equal(canonicalText, text(content), 'Old turn body differs from canonical record');
    assert(isDeepStrictEqual(canonicalMetadata, metadata), 'Old turn metadata differs from canonical record');
    return {delete:turn.name, currentDocument:{updateTime:turn.updateTime}};
  });
  return {patch, deletes};
}

async function list(read, path, limit = 5000) {
  const documents = [], seen = new Set();
  let token;
  do {
    const query = new URLSearchParams({pageSize:'100'});
    if (token) query.set('pageToken',token);
    const page = await read(`${API}${path}?${query}`, 'inspect session content');
    documents.push(...page.documents ?? []);
    assert(documents.length <= limit, 'Content inventory exceeds reviewed bound');
    token = page.nextPageToken;
    if (token) { assert(!seen.has(token), 'Repeated content page'); seen.add(token); }
    assert(seen.size <= 50, 'Content page bound exceeded');
  } while (token);
  return documents;
}

export async function inspectContent(read) {
  const sessions = await list(read, ROOT + '/sessions');
  const plans = [];
  let totalTurns = 0;
  for (const document of sessions) {
    sessionName(document.name);
    const turns = await list(read, document.name + '/session_turns');
    totalTurns += turns.length;
    assert(totalTurns <= 10000, 'Total turn inventory exceeds reviewed bound');
    plans.push({name:document.name, updateTime:document.updateTime, ...contentPlan(document, turns)});
  }
  return {plans, counts:{scanned:sessions.length, conversions:plans.filter(plan => plan.patch).length,
    duplicateTurns:plans.reduce((total,plan) => total + plan.deletes.length,0)}};
}

/** At most 200 writes per commit, including a root-version fence for every
 * session whose duplicate turns occur in that commit. */
export function contentCleanupBatches(plans) {
  const batches = [];
  let batch = [];
  for (const plan of plans) {
    for (let offset = 0; offset < plan.deletes.length; offset += 199) {
      const group = [{verify:plan.name, currentDocument:{updateTime:plan.updateTime}}, ...plan.deletes.slice(offset,offset+199)];
      if (batch.length + group.length > 200) { batches.push(batch); batch = []; }
      batch.push(...group);
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function migrateContent({read,write,assertCurrent}) {
  assert.equal(typeof assertCurrent, 'function', 'Exact-source approval recheck required');
  await assertCurrent();
  const before = await inspectContent(read);
  const patches = before.plans.flatMap(plan => plan.patch ? [plan.patch] : []);
  for (let offset = 0; offset < patches.length; offset += 200) {
    await assertCurrent();
    await write(`${API}${ROOT}:commit`, 'preserve session content', 'POST', {writes:patches.slice(offset,offset+200)});
  }
  // Re-read and verify all preserved content before any duplicate is removed.
  // Each cleanup batch also atomically fences every affected session and turn.
  await assertCurrent();
  const preserved = await inspectContent(read);
  assert.equal(preserved.counts.conversions,0,'Canonical records not visible after preservation');
  for (const writes of contentCleanupBatches(preserved.plans)) {
    await assertCurrent();
    await write(`${API}${ROOT}:commit`, 'remove verified duplicate turns', 'POST', {writes});
  }
  await assertCurrent();
  const after = await inspectContent(read);
  assert.equal(after.counts.conversions,0,'Content changed during migration; retry');
  assert.equal(after.counts.duplicateTurns,0,'Duplicate cleanup incomplete; retry');
  return {before:before.counts, after:after.counts};
}
