import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectAuthRuntime} from './lai-auth-inspection.mjs';
test('authentication inspection reads only and excludes credentials and user identifiers', async () => {
  const service = {spec:{template:{spec:{serviceAccountName:'runtime@example.iam.gserviceaccount.com',containers:[{env:[{name:'FIREBASE_USE_ADC',value:'true'},{name:'FIREBASE_PROJECT_ID',value:'litigant-ai'},{name:'FIREBASE_SERVICE_ACCOUNT',value:'private-material'}]}]}}}};
  const report = await inspectAuthRuntime(service, async (url, label, method, body) => {
    assert(!url.includes('setIamPolicy'));
    if (url.endsWith('accounts:lookup')) return {users:[{email:'private-material',localId:'private-material',passwordHash:'private-material',emailVerified:true,customAttributes:JSON.stringify({admin:true,private:'private-material'})}]};
    if (url.endsWith('testIamPermissions')) return {permissions:['firebaseauth.users.get']};
    return {bindings:[{role:'roles/firebaseauth.admin',members:['serviceAccount:runtime@example.iam.gserviceaccount.com']}]};
  });
  assert.equal(report.owner.admin, true); assert.equal(report.usesAdc,true);
  assert(!JSON.stringify(report).includes('private-material'));
});
test('missing owner and denied inspection remain distinguishable without raw errors', async () => {
  const missing = await inspectAuthRuntime({}, async () => ({}));
  assert.equal(missing.owner.found,false);
  const denied = await inspectAuthRuntime({}, async () => { throw Object.assign(Error('private-material'),{httpStatus:403}); });
  assert.deepEqual(denied.owner,{httpStatus:403});
  assert(!JSON.stringify(denied).includes('private-material'));
});
