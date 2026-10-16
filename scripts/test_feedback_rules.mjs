import assert from 'node:assert/strict';
// Demo project and loopback are mandatory: this script cannot touch production.
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(host, '127.0.0.1:8189', 'Run only through the isolated Firestore emulator');
const root = `http://${host}/v1/projects/demo-litigant-readiness/databases/(default)/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({alg:'none',typ:'JWT'})}.${encode({sub:'test-owner',user_id:'test-owner',aud:'demo-litigant-readiness',iss:'https://securetoken.google.com/demo-litigant-readiness',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'password'}})}.`;
async function create(path, fields, authenticated = false) {
  return fetch(`${root}/${path}`, {method:'PATCH', headers:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({fields})});
}
const profile = await create('users/test-owner',{displayName:{stringValue:'Fixture owner'}},true);
assert.equal(profile.status,200,'The authenticated control must work before testing feedback denial');
for (const authenticated of [false,true]) {
  const r=await create(`feedback/attempt-${authenticated}`,{userId:authenticated?{stringValue:'test-owner'}:{nullValue:null},rating:{stringValue:'bad'}},authenticated);
  assert.equal(r.status,403,'Direct client feedback writes must be denied');
}
console.log('Anonymous and authenticated direct feedback writes denied; authenticated profile control passed.');
