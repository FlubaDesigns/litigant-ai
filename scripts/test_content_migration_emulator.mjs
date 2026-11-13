import assert from 'node:assert/strict';
import {contentPlan, migrateContent, inspectContent} from './lai-content-migration.mjs';
const host=process.env.FIRESTORE_EMULATOR_HOST;
assert(host && /^(127\.0\.0\.1|localhost):\d+$/.test(host),'Local emulator required');
const ROOT='projects/litigant-ai/databases/(default)/documents';
const live='https://firestore.googleapis.com/v1/'+ROOT;
const local=`http://${host}/v1/projects/demo-litigant-readiness/databases/(default)/documents`;
async function call(url,_label,method='GET',body) {
  assert(url.startsWith(live));
  const response=await fetch(url.replace(live,local),{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
    body:body?JSON.stringify(body).replaceAll('projects/litigant-ai/','projects/demo-litigant-readiness/'):undefined});
  const value=await response.json();
  if(!response.ok)throw Object.assign(Error('Emulator HTTP '+response.status),{httpStatus:response.status});
  return JSON.parse(JSON.stringify(value).replaceAll('projects/demo-litigant-readiness/','projects/litigant-ai/'));
}
const s=ROOT+'/sessions/content-migration-emulator',t=s+'/session_turns/turn_000';
const str=stringValue=>({stringValue});
await call(live+':commit','','POST',{writes:[
  {update:{name:s,fields:{transcript:str('**User:** Follow-up'),debateNotes:str('Notes'),title:str('Owner title'),creditsUsed:{integerValue:'42'}}}},
  {update:{name:t,fields:{role:str('Verdict'),round:{integerValue:'99'},content:str('Separate verdict'),createdAt:{timestampValue:'2026-01-01T00:00:00.123456789Z'}}}},
]});
const original=await call('https://firestore.googleapis.com/v1/'+s);
const old=await call('https://firestore.googleapis.com/v1/'+t);
const plan=contentPlan(original,[old]);
await call(live+':commit','','POST',{writes:[plan.patch]});
const preserved=await call('https://firestore.googleapis.com/v1/'+s);
assert(!preserved.fields.transcript);assert(!preserved.fields.debateNotes);
assert.equal(preserved.fields.title.stringValue,'Owner title');assert.equal(preserved.fields.creditsUsed.integerValue,'42');
const cleanup=contentPlan(preserved,[old]);assert.equal(cleanup.patch,null);
// A concurrent owner edit must veto the entire duplicate-deletion transaction.
await call(live+':commit','','POST',{writes:[{update:{name:s,fields:{title:str('Concurrent owner edit')}},updateMask:{fieldPaths:['title']}}]});
await assert.rejects(call(live+':commit','','POST',{writes:[
  {verify:s,currentDocument:{updateTime:preserved.updateTime}},...cleanup.deletes,
]}),error=>[400,409,412].includes(error.httpStatus));
assert.equal((await call('https://firestore.googleapis.com/v1/'+t)).fields.content.stringValue,'Separate verdict');
await migrateContent({read:call,write:call,assertCurrent:async()=>{}});
const after=await call('https://firestore.googleapis.com/v1/'+s);
assert.equal(after.fields.title.stringValue,'Concurrent owner edit');
assert.equal(after.fields.creditsUsed.integerValue,'42');
const metadata=after.fields.sessionContent.mapValue.fields.turns.arrayValue.values[0].mapValue.fields.metadata.mapValue.fields;
assert.equal(metadata.createdAt.timestampValue,old.fields.createdAt.timestampValue);
await assert.rejects(call('https://firestore.googleapis.com/v1/'+t),error=>error.httpStatus===404);
assert.deepEqual((await inspectContent(call)).counts.conversions,0);
await migrateContent({read:call,write:call,assertCurrent:async()=>{}});
console.log('Content migration emulator checks passed: preservation, atomic conflict, retry, exact timestamps and duplicate-only cleanup.');
