/** Owner-authorized full LAI credential access and preservation of existing runtime keys. */
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';

export const NAMES = Object.freeze(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY', 'RESEND_API_KEY', 'SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SIGNATURE_KEY']);
export const CORTEX = 'serviceAccount:299349451575-compute@developer.gserviceaccount.com';
const ROOT = 'https://secretmanager.googleapis.com/v1/projects/litigant-ai/secrets';
const PROJECT = 'https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai';
const SERVICE = 'https://run.googleapis.com/v2/projects/litigant-ai/locations/us-central1/services/api';
const REQUIRED = ['secretmanager.secrets.get', 'secretmanager.secrets.getIamPolicy', 'secretmanager.secrets.setIamPolicy', 'secretmanager.versions.get', 'secretmanager.versions.access', 'secretmanager.versions.add'];
function sameValue(a, b) {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
function requireSameValue(a,b) { if (!sameValue(a,b)) throw Error('Stored credential differs from approved runtime value'); }
function decodeVersion(response) {
  if(typeof response?.payload?.data !== 'string') throw Error('Credential payload unavailable');
  return Buffer.from(response.payload.data,'base64').toString('utf8');
}
export function versionNumber(response, name) {
  const match=String(response?.name||'').match(/^projects\/(?:litigant-ai|781960492360)\/secrets\/([A-Z_]+)\/versions\/([1-9][0-9]*)$/);
  assert(match && match[1]===name, 'Unexpected credential version resource');
  return match[2];
}
export function migrationValues(service) {
  const values=new Map();
  const container=service.spec?.template?.spec?.containers?.[0];
  assert(container && service.spec.template.spec.containers.length===1,'One existing runtime container required');
  for(const name of NAMES) {
    const entries=(container.env||[]).filter(entry=>entry.name===name);
    assert(entries.length===1,'Exactly one configured entry required for '+name);
    const entry=entries[0];
    // An interrupted migration that already switched the runtime must not copy
    // back from another source or silently remigrate it.
    assert(!entry.valueFrom && typeof entry.value==='string' && entry.value.length>=20 && entry.value.length<=4096,'Plaintext source unavailable for '+name);
    assert(!/[\s\u0000-\u001f\u007f]/.test(entry.value),'Invalid source credential for '+name);
    values.set(name,entry.value);
  }
  return values;
}
export function scopedPolicy(policy, runtimeMember) {
  assert(/^serviceAccount:[A-Za-z0-9@._-]+\.gserviceaccount\.com$/.test(runtimeMember),'Existing runtime identity required');
  const result=structuredClone(policy); result.version=3; result.bindings||=[];
  for(const [member,roles] of [[runtimeMember,['roles/secretmanager.secretAccessor']]]) {
    for(const role of roles) {
      let binding=result.bindings.find(item=>item.role===role && !item.condition);
      if(!binding) {binding={role,members:[]}; result.bindings.push(binding);}
      binding.members||=[]; if(!binding.members.includes(member))binding.members.push(member);
    }
  }
  return result;
}
export function accessPolicy(policy, role) {
  assert(['roles/secretmanager.admin','roles/run.viewer'].includes(role),'Unapproved Cortex role');
  const result=structuredClone(policy); result.version=3; result.bindings||=[];
  let binding=result.bindings.find(item=>item.role===role&&!item.condition);
  if(!binding){binding={role,members:[]};result.bindings.push(binding);}
  binding.members||=[];
  if(!binding.members.includes(CORTEX))binding.members.push(CORTEX);
  return result;
}
function hasCortexRole(policy,role) {
  return policy.bindings?.some(binding=>binding.role===role&&!binding.condition&&binding.members?.includes(CORTEX))===true;
}
export function migrationShape(service) {
  const result=structuredClone(service);
  result.spec.template.spec.containers[0].env=(result.spec.template.spec.containers[0].env||[]).filter(entry=>!NAMES.includes(entry.name));
  return result;
}
export function verifyBindings(service, versions) {
  const env=service.spec.template.spec.containers[0].env||[];
  for(const name of NAMES) {
    const entries=env.filter(entry=>entry.name===name);
    assert(entries.length===1 && !Object.hasOwn(entries[0],'value'),'Credential remains in ordinary runtime environment: '+name);
    const ref=entries[0].valueFrom?.secretKeyRef;
    assert(ref?.name===name && ref.key===versions[name],'Pinned runtime binding mismatch for '+name);
  }
}
async function requirePermissions(read,url,permissions,label,gaps) {
  const actual=await read(url,label,'POST',{permissions});
  const granted=new Set(actual.permissions||[]);
  const missing=permissions.filter(permission=>!granted.has(permission));
  if(missing.length&&gaps) {gaps.push(label+': '+missing.join(', '));return false;}
  assert(missing.length===0,label+' missing permissions: '+missing.join(', '));
  return true;
}
async function optional(read,url,label) {
  try {return await read(url,label);} catch(error) {if(error.httpStatus===404)return null;throw error;}
}
async function policiesMatch(read, name, expected) {
  const current=await read(ROOT+'/'+name+':getIamPolicy?options.requestedPolicyVersion=3','verify named credential policy');
  // Compare only required additions. Google may reorder policy bindings.
  for(const binding of expected.bindings) {
    if(binding.condition)continue;
    for(const member of binding.members||[]) {
      assert(current.bindings?.some(item=>item.role===binding.role&&!item.condition&&item.members?.includes(member)), 'Named credential policy verification failed');
    }
  }
}
function verifyPolicy(current,expected) {
  for(const binding of expected.bindings||[]) {
    const actual=current.bindings?.find(item=>item.role===binding.role&&JSON.stringify(item.condition||null)===JSON.stringify(binding.condition||null));
    assert(actual&&(binding.members||[]).every(member=>actual.members?.includes(member)),'Credential access policy verification failed');
  }
  assert(JSON.stringify(current.auditConfigs||[])===JSON.stringify(expected.auditConfigs||[]),'Audit configuration changed');
}
export async function prepareMigration(service, read) {
  const values=migrationValues(service);
  const runtimeMember='serviceAccount:'+service.spec.template.spec.serviceAccountName;
  scopedPolicy({bindings:[]},runtimeMember); // validate before any mutation
  await requirePermissions(read,PROJECT+':testIamPermissions',
    ['resourcemanager.projects.getIamPolicy'], 'Cortex full credential access');
  await requirePermissions(read,SERVICE+':testIamPermissions',
    ['run.services.getIamPolicy'], 'Cortex API visibility');
  const projectPolicy=await read(PROJECT+':getIamPolicy','read project credential policy','POST',{options:{requestedPolicyVersion:3}});
  const servicePolicy=await read(SERVICE+':getIamPolicy?options.requestedPolicyVersion=3','read runtime visibility policy');
  assert(projectPolicy.etag&&servicePolicy.etag,'Concurrent policy protection required');
  const updateProjectPolicy=!hasCortexRole(projectPolicy,'roles/secretmanager.admin');
  const updateServicePolicy=!hasCortexRole(servicePolicy,'roles/run.viewer');
  const permissionGaps=[];
  if(updateProjectPolicy) await requirePermissions(read,PROJECT+':testIamPermissions',
    ['resourcemanager.projects.setIamPolicy'], 'Cortex full credential access',permissionGaps);
  if(updateServicePolicy) await requirePermissions(read,SERVICE+':testIamPermissions',
    ['run.services.setIamPolicy'], 'Cortex API visibility',permissionGaps);
  const entries=[];
  for(const name of NAMES) {
    const resource=ROOT+'/'+name;
    const metadata=await optional(read,resource,'read named credential metadata');
    if(metadata) {
      if(!await requirePermissions(read,resource+':testIamPermissions',REQUIRED,'existing credential '+name,permissionGaps))continue;
      const policy=await read(resource+':getIamPolicy?options.requestedPolicyVersion=3','read named credential policy');
      const latest=await optional(read,resource+'/versions/latest','read credential version metadata');
      let version=null;
      if(latest?.state==='ENABLED') {
        const candidate=versionNumber(latest,name);
        const stored=decodeVersion(await read(resource+'/versions/'+candidate+':access','compare current credential'));
        if(sameValue(stored,values.get(name)))version=candidate;
      }
      entries.push({name,policy,version,exists:true});
    } else {
      if(!await requirePermissions(read,'https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:testIamPermissions',
        ['secretmanager.secrets.create',...REQUIRED],'new credential '+name,permissionGaps))continue;
      entries.push({name,policy:null,version:null,exists:false});
    }
  }
  assert(permissionGaps.length===0,'Credential migration missing permissions: '+permissionGaps.join('; '));
  return {values,runtimeMember,entries,projectPolicy,servicePolicy,updateProjectPolicy,updateServicePolicy};
}
export async function migrateCredentials({before,read,assertCurrent,readRuntime,updateRuntime,fingerprint,assertReady,verifyHealth}) {
  const plan=await prepareMigration(before,read);
  const baseline=fingerprint(migrationShape(before));
  const originalImage=before.spec.template.spec.containers[0].image;
  const provenance=JSON.stringify((before.spec.template.spec.containers[0].env||[]).filter(entry=>['DEPLOY_GIT_SHA','DEPLOY_TIMESTAMP'].includes(entry.name)));
  const unchanged=async()=>{
    await assertCurrent();
    const current=await readRuntime();
    assert(current.metadata.resourceVersion===before.metadata.resourceVersion,'Runtime changed after migration inspection');
    assert(fingerprint(current)===fingerprint(before),'Runtime changed after migration inspection');
  };
  await unchanged();
  const projectPolicy=accessPolicy(plan.projectPolicy,'roles/secretmanager.admin');
  if(plan.updateProjectPolicy) await read(PROJECT+':setIamPolicy','grant Cortex full LAI credential access','POST',{policy:projectPolicy});
  verifyPolicy(await read(PROJECT+':getIamPolicy','verify project credential access','POST',{options:{requestedPolicyVersion:3}}),projectPolicy);
  await unchanged();
  const servicePolicy=accessPolicy(plan.servicePolicy,'roles/run.viewer');
  if(plan.updateServicePolicy) await read(SERVICE+':setIamPolicy','grant Cortex LAI runtime visibility','POST',{policy:servicePolicy});
  verifyPolicy(await read(SERVICE+':getIamPolicy?options.requestedPolicyVersion=3','verify runtime visibility'),servicePolicy);
  const versions={};
  for(const entry of plan.entries) {
    await unchanged();
    const resource=ROOT+'/'+entry.name;
    if(!entry.exists) {
      await read(ROOT+'?secretId='+entry.name,'create named credential slot','POST',{replication:{automatic:{}}});
      entry.policy=await read(resource+':getIamPolicy?options.requestedPolicyVersion=3','read created credential policy');
    }
    if(!entry.version) {
      const added=await read(resource+':addVersion','preserve existing credential in managed storage','POST',
        {payload:{data:Buffer.from(plan.values.get(entry.name)).toString('base64')}});
      entry.version=versionNumber(added,entry.name);
    }
    const preserved=decodeVersion(await read(resource+'/versions/'+entry.version+':access','verify preserved credential'));
    requireSameValue(preserved,plan.values.get(entry.name));
    const policy=scopedPolicy(entry.policy,plan.runtimeMember);
    await read(resource+':setIamPolicy','grant only named credential access','POST',{policy});
    await policiesMatch(read,entry.name,policy);
    versions[entry.name]=entry.version;
  }
  await unchanged();
  // Replace only approved entries, preserving configuration and optimistic concurrency.
  const replacement=structuredClone(before);
  delete replacement.status;
  delete replacement.spec.template.metadata?.name;
  replacement.spec.template.spec.containers[0].env=replacement.spec.template.spec.containers[0].env.map(entry=>NAMES.includes(entry.name)
    ? {name:entry.name,valueFrom:{secretKeyRef:{name:entry.name,key:versions[entry.name]}}}:entry);
  await updateRuntime(replacement);
  const after=await readRuntime();assertReady(after);
  assert(after.spec.template.spec.containers[0].image===originalImage,'Application image changed unexpectedly');
  assert(fingerprint(migrationShape(after))===baseline,'Unapproved runtime or traffic change');
  assert(JSON.stringify((after.spec.template.spec.containers[0].env||[]).filter(entry=>['DEPLOY_GIT_SHA','DEPLOY_TIMESTAMP'].includes(entry.name)))===provenance,'Application release provenance changed');
  verifyBindings(after,versions);
  await assertCurrent();await verifyHealth(after.status.url);
  return {project:'litigant-ai',service:'api',migrated:NAMES.map(name=>({name,version:versions[name]})),
    cortexAccess:'all-project-credentials',valuesPreserved:true,applicationUnchanged:true,runtimeReady:true,healthVerified:true,providerCallsVerified:false};
}
