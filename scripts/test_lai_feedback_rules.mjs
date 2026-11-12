import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deployFeedbackRules,inspectFeedbackRules,RULES_RELEASE} from './lai-feedback-rules.mjs';
const content=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const baseline=readFileSync(new URL('./fixtures/firestore-before-profile.rules',import.meta.url),'utf8');

function fixture(source=baseline) {
 let active='projects/litigant-ai/rulesets/original';
 const sources={[active]:source}; const writes=[];
 const read=async url=>url.endsWith('/releases/cloud.firestore')?{name:RULES_RELEASE,rulesetName:active}:{source:{files:[{name:'firestore.rules',content:sources[url.replace('https://firebaserules.googleapis.com/v1/','')]}]}};
 const write=async(url,label,method,body)=>{
  writes.push({url,method,body});
  if(method==='POST'){const name='projects/litigant-ai/rulesets/reviewed';sources[name]=body.source.files[0].content;return {name};}
  active=body.release.rulesetName;return {name:RULES_RELEASE,rulesetName:active};
 };
 return {read,write,writes,content,assertCurrent:async()=>{}};
}
test('inspection is read-only and an approved release changes only the existing default rules release',async()=>{
 const f=fixture();await inspectFeedbackRules(f.read,content);assert.equal(f.writes.length,0);
 assert.deepEqual(await deployFeedbackRules(f),{changed:true});
 assert.deepEqual(f.writes.map(w=>w.method),['POST','PATCH']);
 assert.equal(f.writes[1].url,'https://firebaserules.googleapis.com/v1/'+RULES_RELEASE);
 assert.equal(f.writes[1].body.updateMask,'rulesetName');
 assert.deepEqual(await deployFeedbackRules(f),{changed:false});assert.equal(f.writes.length,2);
});
test('rejects drifted rules, changed candidate and failed approval before mutation',async()=>{
 for(const f of [fixture(baseline+'\n'),{...fixture(),content:content+'\n'},{...fixture(),assertCurrent:async()=>{throw Error('approval stale');}}]){
  await assert.rejects(deployFeedbackRules(f));assert.equal(f.writes.length,0);
 }
});
test('approval is rechecked before activating a newly created ruleset',async()=>{
 const f=fixture();let checks=0;f.assertCurrent=async()=>{if(++checks===3)throw Error('approval stale');};
 await assert.rejects(deployFeedbackRules(f));assert.deepEqual(f.writes.map(w=>w.method),['POST']);
});
