// One reviewed tightening of the default Firestore rules, behind the existing
// exact-source Engine approval. No catalog, IAM, data, or other release changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BASE_RULES_HASH = '41fd2c9c0317317e436d329cf6b420b183692dc2e7976b703c9340f836cf0fc6';
export const TARGET_RULES_HASH = 'b1d1b3505095ed56b0a64d9f6e20a44e2909a93272ed725c4baafc8609d05282';
export const RULES_RELEASE = 'projects/litigant-ai/releases/cloud.firestore';
const API = 'https://firebaserules.googleapis.com/v1/';
const hash = text => createHash('sha256').update(text).digest('hex');
function rulesetName(name) {
  assert(/^projects\/litigant-ai\/rulesets\/[a-zA-Z0-9-]+$/.test(name), 'Unexpected ruleset scope');
  return name;
}
export async function inspectFeedbackRules(read, content) {
  assert.equal(hash(content), TARGET_RULES_HASH, 'Candidate rules differ from reviewed feedback restriction');
  const release = await read(API + RULES_RELEASE, 'read default Firestore rules release');
  assert.equal(release.name, RULES_RELEASE);
  const ruleset = await read(API + rulesetName(release.rulesetName), 'read active Firestore rules');
  assert.equal(ruleset.source?.files?.length, 1, 'Unexpected active rules source bundle');
  const activeHash = hash(ruleset.source.files[0].content);
  assert([BASE_RULES_HASH,TARGET_RULES_HASH].includes(activeHash), 'Active rules have drifted; review before release');
  return {rulesetName:release.rulesetName, activeHash};
}
export async function deployFeedbackRules({read, write, content, assertCurrent}) {
  assert.equal(typeof assertCurrent, 'function', 'Exact-source approval recheck required');
  await assertCurrent();
  const before = await inspectFeedbackRules(read,content);
  if (before.activeHash === TARGET_RULES_HASH) return {changed:false};
  await assertCurrent();
  const created = await write(API + 'projects/litigant-ai/rulesets', 'create reviewed feedback restriction', 'POST',
    {source:{files:[{name:'firestore.rules',content}]}});
  rulesetName(created.name);
  await assertCurrent();
  const current = await inspectFeedbackRules(read,content);
  assert.equal(current.rulesetName,before.rulesetName,'Concurrent rules release detected');
  // PATCH only the existing default Firestore release. Never create/delete releases.
  await write(API + RULES_RELEASE, 'activate reviewed feedback restriction', 'PATCH',
    {release:{name:RULES_RELEASE,rulesetName:created.name},updateMask:'rulesetName'});
  const after = await inspectFeedbackRules(read,content);
  assert.equal(after.rulesetName,created.name,'Rules release did not activate');
  assert.equal(after.activeHash,TARGET_RULES_HASH,'Feedback restriction not active');
  return {changed:true};
}
