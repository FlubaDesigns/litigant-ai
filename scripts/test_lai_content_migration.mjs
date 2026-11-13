import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contentPlan, inspectContent, migrateContent} from './lai-content-migration.mjs';

const ROOT='projects/litigant-ai/databases/(default)/documents';
const str=stringValue=>({stringValue});
const map=fields=>({mapValue:{fields}});
const int=value=>({integerValue:String(value)});
const session=()=>({name:ROOT+'/sessions/s',updateTime:'2026-01-01T00:00:00Z',fields:{
  transcript:str('**Advocate:** Evidence'),transcriptLines:{arrayValue:{values:[str('**User:** Follow-up')]}},
  debateNotes:str('### Advocate — Round 1\nEvidence'),finalAnswer:str('Keep answer'),creditBalance:int(17)}});
const turn=()=>({name:ROOT+'/sessions/s/session_turns/turn_000',updateTime:'2026-01-01T00:00:00Z',fields:{
  content:str('Evidence'),role:str('Advocate'),round:int(1),turnIndex:int(0),
  createdAt:{timestampValue:'2026-01-01T00:00:00Z'},custom:{referenceValue:ROOT+'/sessions/parent'}}});
function converted(original,plan) {
  const fields={...original.fields,...plan.patch.update.fields};
  for(const key of ['transcript','transcriptLines','debateNotes'])delete fields[key];
  return {...original,fields,updateTime:'2026-01-02T00:00:00Z'};
}
test('preserves every view and raw turn metadata with scoped preconditioned writes',()=>{
  const doc=session(), old=turn(), plan=contentPlan(doc,[old]);
  assert.deepEqual(plan.patch.updateMask.fieldPaths,['sessionContent','transcript','transcriptLines','debateNotes']);
  assert.deepEqual(plan.patch.currentDocument,{updateTime:doc.updateTime});
  assert.deepEqual(Object.keys(plan.patch.update.fields),['sessionContent']);
  const blocks=plan.patch.update.fields.sessionContent.mapValue.fields.blocks.arrayValue.values;
  assert.deepEqual(blocks,[str('Evidence'),str('Follow-up')]);
  const retained=plan.patch.update.fields.sessionContent.mapValue.fields.turns.arrayValue.values[0].mapValue.fields.metadata.mapValue.fields;
  assert.deepEqual(retained.createdAt,old.fields.createdAt);assert.deepEqual(retained.custom,old.fields.custom);
  const second=contentPlan(converted(doc,plan),[old]);assert.equal(second.patch,null);assert.deepEqual(second.deletes,plan.deletes);
});
test('refuses to delete a changed or additional old turn',()=>{
  const doc=session(), old=turn(), saved=converted(doc,contentPlan(doc,[old]));
  assert.throws(()=>contentPlan(saved,[{...old,fields:{...old.fields,content:str('Changed')}}]),/body differs/);
  assert.throws(()=>contentPlan(saved,[{...old,fields:{...old.fields,custom:str('Changed')}}]),/metadata differs/);
  assert.throws(()=>contentPlan(saved,[{...old,name:old.name+'extra'}]),/absent/);
});
test('fences active runs, deletion and unexpected Free content',()=>{
  const doc=session();
  assert.throws(()=>contentPlan({...doc,fields:{...doc.fields,activeRun:map({id:str('run'),expiresAt:int(999)})}},[],1),/still running/);
  assert.throws(()=>contentPlan({...doc,fields:{...doc.fields,status:str('deleting')}},[]),/deletion/);
  assert.throws(()=>contentPlan({...doc,fields:{...doc.fields,memorySaved:{booleanValue:false}}},[]),/Free session/);
  assert.deepEqual(contentPlan({...doc,fields:{memorySaved:{booleanValue:false}}},[]),{patch:null,deletes:[]});
});
test('does not mutate input and rejects other projects and malformed saved fields',()=>{
  const doc=session(), old=turn(), copy=structuredClone({doc,old});contentPlan(doc,[old]);assert.deepEqual({doc,old},copy);
  assert.throws(()=>contentPlan({...doc,name:doc.name.replace('litigant-ai','other')},[old]),/Wrong/);
  assert.throws(()=>contentPlan({...doc,fields:{...doc.fields,transcript:{integerValue:'2'}}},[]),/must be text/);
});
test('keeps unindexed turns and fixed-stage verdicts even when absent from display',()=>{
  const old=turn();delete old.fields.turnIndex;old.fields.role=str('Verdict');old.fields.content=str('Verdict only');
  const plan=contentPlan(session(),[old]);
  assert(plan.patch.update.fields.sessionContent.mapValue.fields.blocks.arrayValue.values.some(v=>v.stringValue==='Verdict only'));
  assert.equal(plan.deletes.length,1);
});

test('migration re-reads preservation before cleanup and verifies session on each delete batch',async()=>{
  let doc=session(), turns=[turn()];const writes=[];
  const read=async url=>{
    if(url.includes('/session_turns?'))return {documents:turns};
    if(url.includes('/sessions?'))return {documents:[doc]};
    if(url.endsWith('/sessions/s'))return doc;
    throw Error('Unexpected URL');
  };
  const write=async(_url,_label,_method,body)=>{
    writes.push(body.writes);
    if(body.writes[0].update)doc=converted(doc,{patch:body.writes[0]});
    else {
      assert.deepEqual(body.writes[0],{verify:doc.name,currentDocument:{updateTime:doc.updateTime}});
      turns=[];
    }
  };
  let checks=0;
  const result=await migrateContent({read,write,assertCurrent:async()=>{checks++;}});
  assert.equal(result.before.conversions,1);assert.equal(result.before.duplicateTurns,1);
  assert.deepEqual(result.after,{scanned:1,conversions:0,duplicateTurns:0});assert.equal(writes.length,2);assert(checks>=4);
  await migrateContent({read,write,assertCurrent:async()=>{}});assert.equal(writes.length,2);
});
test('failed preservation never starts duplicate deletion',async()=>{
  const write=async()=>{throw Error('Conflict');};let calls=0;
  await assert.rejects(migrateContent({read:async url=>({documents:url.includes('/session_turns?')?[turn()]:[session()]}),
    write:async(...args)=>{calls++;return write(...args);},assertCurrent:async()=>{}}),/Conflict/);
  assert.equal(calls,1);
});
test('inventory rejects repeated pagination without logging content',async()=>{
  await assert.rejects(inspectContent(async()=>({documents:[],nextPageToken:'repeated'})),/Repeated/);
});
