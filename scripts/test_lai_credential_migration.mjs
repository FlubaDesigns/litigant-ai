import test from 'node:test';
import assert from 'node:assert/strict';
import {NAMES,CORTEX,migrationValues,accessPolicy,scopedPolicy,versionNumber,migrateCredentials} from './lai-credential-migration.mjs';
import {runtimeFingerprint,validateDescriptor} from './lai-release.mjs';

const value=name=>'fixture-only-not-a-live-credential-'+name;
const root='https://secretmanager.googleapis.com/v1/projects/litigant-ai/secrets';
const project='https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai';
const run='https://run.googleapis.com/v2/projects/litigant-ai/locations/us-central1/services/api';
function policy(){return {version:3,etag:'fixture-etag',bindings:[{role:'roles/viewer',members:['user:fixture@example.invalid'],condition:{title:'preserve',expression:'false'}}],auditConfigs:[{service:'allServices',auditLogConfigs:[{logType:'ADMIN_READ'}]}]};}
function snapshot(){return {apiVersion:'serving.knative.dev/v1',kind:'Service',metadata:{name:'api',namespace:'litigant-ai',resourceVersion:'1'},spec:{template:{metadata:{name:'api-old'},spec:{serviceAccountName:'fixture@litigant-ai.iam.gserviceaccount.com',containers:[{image:'fixture-image',env:[...NAMES.map(name=>({name,value:value(name)})),{name:'ADMIN_MASTER_SECRET',value:''},{name:'OTHER_CONFIG',value:'preserve'},{name:'DEPLOY_GIT_SHA',value:'fixture-source'}]}]}},traffic:[{latestRevision:true,percent:100}]},status:{url:'https://fixture.run.app'}};}
function fixture({deny=false,drift=false,corrupt=false,pregranted=false,denyPolicyWrites=false}={}){
  const before=snapshot(),calls=[],secrets=new Map(),policies=new Map([[project,policy()],[run,policy()]]);
  if(pregranted) {
    policies.set(project,accessPolicy(policy(),'roles/secretmanager.admin'));
    policies.set(run,accessPolicy(policy(),'roles/run.viewer'));
  }
  secrets.set('SQUARE_ACCESS_TOKEN',{version:'1',value:value('SQUARE_ACCESS_TOKEN')});
  policies.set(root+'/SQUARE_ACCESS_TOKEN',policy());
  let live=structuredClone(before),updated=false,healthy=false,guards=0;
  async function read(url,label,method='GET',body){
    calls.push({url,method,body});
    if(url.endsWith(':testIamPermissions'))return {permissions:deny?[]:body.permissions.filter(permission=>!denyPolicyWrites||!['resourcemanager.projects.setIamPolicy','run.services.setIamPolicy'].includes(permission))};
    const base=url.split(':getIamPolicy')[0].split(':setIamPolicy')[0];
    if(url.includes(':getIamPolicy'))return structuredClone(policies.get(base)||policy());
    if(url.endsWith(':setIamPolicy')){policies.set(base,structuredClone(body.policy));return body.policy;}
    if(url.startsWith(root+'?secretId=')){
      const name=url.split('=')[1];secrets.set(name,{version:null,value:null});policies.set(root+'/'+name,policy());return {name:'projects/litigant-ai/secrets/'+name};
    }
    const name=url.slice(root.length+1).split(/[/:]/)[0],slot=secrets.get(name);
    if(!slot){const e=Error('fixture missing');e.httpStatus=404;throw e;}
    if(url.endsWith(':addVersion')){slot.version='2';slot.value=Buffer.from(body.payload.data,'base64').toString('utf8');return {name:'projects/781960492360/secrets/'+name+'/versions/2'};}
    if(url.endsWith(':access'))return {payload:{data:Buffer.from(corrupt?'fixture-corrupted-value':slot.value).toString('base64')}};
    if(url.endsWith('/versions/latest'))return {name:'projects/litigant-ai/secrets/'+name+'/versions/'+slot.version,state:'ENABLED'};
    return {name:'projects/litigant-ai/secrets/'+name};
  }
  return {before,calls,policies,secrets,get updated(){return updated;},get healthy(){return healthy;},get live(){return live;},
    args:{before,read,assertCurrent:async()=>{guards++;if(drift&&guards>1)throw Error('Main changed');},readRuntime:async()=>structuredClone(live),
      updateRuntime:async replacement=>{updated=true;live=structuredClone(replacement);live.status={url:'https://fixture.run.app'};live.metadata.resourceVersion='2';},
      fingerprint:runtimeFingerprint,assertReady:()=>{},verifyHealth:async()=>{healthy=true;}}};
}
test('migration action requires exact inspected source and Engine approval',()=>{
  const sha='0123456789abcdef0123456789abcdef01234567',controller='89abcdef0123456789abcdef0123456789abcdef';
  const d={schemaVersion:1,action:'migrate-credentials',sourceCommit:sha,project:'litigant-ai',region:'us-central1',service:'api',hostingSite:'litigant-ai',approval:{controlSha:sha,preflight:{runId:'123',runAttempt:1,headSha:sha},engine:{repository:'FlubaDesigns/fluba-designs',commitSha:sha,runId:'124',runAttempt:1}}};
  assert.equal(validateDescriptor(d,controller).action,'migrate-credentials');
  assert.throws(()=>validateDescriptor({...d,approval:null},controller));
  assert.throws(()=>validateDescriptor(d,sha));
});
test('full credential grant preserves existing conditions and audit policy, targets only Cortex',()=>{
  const original=policy(),result=accessPolicy(original,'roles/secretmanager.admin');
  assert.deepEqual(original,policy());assert.deepEqual(result.bindings[0],original.bindings[0]);
  assert.deepEqual(result.bindings[1],{role:'roles/secretmanager.admin',members:[CORTEX]});
  assert.deepEqual(result.auditConfigs,original.auditConfigs);assert.equal(result.etag,original.etag);
  assert.deepEqual(accessPolicy(result,'roles/secretmanager.admin'),result);
  assert.throws(()=>accessPolicy(original,'roles/owner'));
  const runtime=scopedPolicy(original,'serviceAccount:fixture@litigant-ai.iam.gserviceaccount.com');
  assert.equal(runtime.bindings[1].role,'roles/secretmanager.secretAccessor');
  assert.ok(!JSON.stringify(runtime).includes(CORTEX));
});
test('migration rejects missing, duplicated, empty and already bound runtime sources',()=>{
  for(const mutate of [env=>env.pop(),env=>env.push({...env[0]}),env=>{env[0].value='';},env=>{delete env[0].value;env[0].valueFrom={secretKeyRef:{name:NAMES[0],key:'1'}};}]){
    const s=snapshot();s.spec.template.spec.containers[0].env=s.spec.template.spec.containers[0].env.slice(0,NAMES.length);mutate(s.spec.template.spec.containers[0].env);
    assert.throws(()=>migrationValues(s));
  }
  for(const name of ['projects/other/secrets/OPENAI_API_KEY/versions/1','projects/litigant-ai/secrets/OTHER/versions/1','projects/litigant-ai/secrets/OPENAI_API_KEY/versions/latest'])assert.throws(()=>versionNumber({name},'OPENAI_API_KEY'));
});
test('migration preserves values and app, reuses matching version and grants all-project credential management',async()=>{
  const f=fixture(),result=await migrateCredentials(f.args);
  assert.equal(result.cortexAccess,'all-project-credentials');assert.equal(result.valuesPreserved,true);
  assert.equal(result.providerCallsVerified,false);assert.equal(f.updated,true);assert.equal(f.healthy,true);
  assert.equal(result.migrated.find(x=>x.name==='SQUARE_ACCESS_TOKEN').version,'1');
  assert.equal(f.calls.filter(c=>c.url.endsWith(':addVersion')).length,NAMES.length-1);
  for(const name of NAMES){assert.equal(f.secrets.get(name).value,value(name));assert.ok(!JSON.stringify(result).includes(value(name)));}
  const env=f.live.spec.template.spec.containers[0].env;
  assert.equal(env.find(x=>x.name==='OTHER_CONFIG').value,'preserve');assert.equal(env.find(x=>x.name==='ADMIN_MASTER_SECRET').value,'');
  assert.equal(f.live.spec.template.spec.containers[0].image,'fixture-image');
  assert.equal(f.policies.get(project).bindings[1].role,'roles/secretmanager.admin');
  assert.equal(f.policies.get(run).bindings[1].role,'roles/run.viewer');
  assert.ok(f.calls.every(c=>c.url.startsWith(project)||c.url.startsWith(root)||c.url.startsWith(run)));
  const firstWrite=f.calls.findIndex(c=>/:(setIamPolicy|addVersion)$|\?secretId=/.test(c.url));
  assert.equal(f.calls.slice(firstWrite).filter(c=>c.url.endsWith(':testIamPermissions')).length,0);
});
test('missing permissions cause zero cloud mutations',async()=>{
  const f=fixture({deny:true});await assert.rejects(migrateCredentials(f.args),/missing permissions/);
  assert.equal(f.updated,false);assert.ok(!f.calls.some(c=>/:(setIamPolicy|addVersion)$|\?secretId=/.test(c.url)));
});
test('existing Cortex grants allow migration without project or service policy write permission',async()=>{
  const f=fixture({pregranted:true,denyPolicyWrites:true});
  const result=await migrateCredentials(f.args);
  assert.equal(result.valuesPreserved,true);assert.equal(f.healthy,true);
  assert.ok(!f.calls.some(c=>[project+':setIamPolicy',run+':setIamPolicy'].includes(c.url)));
  assert.ok(!f.calls.some(c=>c.url.endsWith(':testIamPermissions')&&c.body.permissions.some(p=>['resourcemanager.projects.setIamPolicy','run.services.setIamPolicy'].includes(p))));
});
test('missing or conditional Cortex grants still require policy write permission before any mutation',async()=>{
  for(const resource of [project,run]) for(const mode of ['missing','conditional','wrong-principal']) {
    const f=fixture({pregranted:true,denyPolicyWrites:true});
    const grant=f.policies.get(resource).bindings[1];
    if(mode==='missing')f.policies.get(resource).bindings.pop();
    if(mode==='conditional')grant.condition={title:'limited',expression:'false'};
    if(mode==='wrong-principal')grant.members=['user:fixture@example.invalid'];
    await assert.rejects(migrateCredentials(f.args),/missing permissions/);
    assert.equal(f.updated,false);
    assert.ok(!f.calls.some(c=>/:(setIamPolicy|addVersion)$|\?secretId=/.test(c.url)));
  }
});
test('revoked pre-existing Cortex grant stops before credential or runtime mutation',async()=>{
  const f=fixture({pregranted:true,denyPolicyWrites:true});
  const assertCurrent=f.args.assertCurrent;
  f.args.assertCurrent=async()=>{await assertCurrent();f.policies.get(project).bindings.pop();};
  await assert.rejects(migrateCredentials(f.args),/policy verification failed/);
  assert.equal(f.updated,false);
  assert.ok(!f.calls.some(c=>/:(setIamPolicy|addVersion)$|\?secretId=/.test(c.url)));
});
test('concurrent source change stops before runtime switch',async()=>{
  const f=fixture({drift:true});await assert.rejects(migrateCredentials(f.args),/Main changed/);assert.equal(f.updated,false);
});
test('stored value mismatch prevents runtime switch and exposes no value in error',async()=>{
  const f=fixture({corrupt:true});await assert.rejects(migrateCredentials(f.args),e=>e.message==='Stored credential differs from approved runtime value');assert.equal(f.updated,false);
});
