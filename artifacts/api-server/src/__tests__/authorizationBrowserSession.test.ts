// @ts-nocheck -- protocol fixtures use a minimal Firestore adapter.
import {it as test, afterEach} from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import { registerBrowserSession } from '../lib/authorizationBrowserSession.js';

async function fixture(t) {
  let clock = 1_800_000_000_000;
  const docs = new Map(), issued = [];
  const config = { origin: 'https://flubadesigns.com', principal: 'release@fixture.iam.gserviceaccount.com', ownerEmail: 'owner@example.test' };
  const user = { uid:'owner-fixture', email:config.ownerEmail, emailVerified:true, disabled:false, customClaims:{admin:true} };
  let identity = {email:config.principal,email_verified:true,iat:clock/1000};
  const db = {collection:()=>({doc:id=>id}),runTransaction:async cb=>cb({get:async id=>({data:()=>docs.get(id)}),set:(id,data)=>docs.set(id,data),create:(id,data)=>docs.set(id,data),update:(id,data)=>docs.set(id,{...docs.get(id),...data})})};
  const app=express();
  registerBrowserSession(app,{db,auth:{getUserByEmail:async()=>user,createCustomToken:async(uid,claims)=>{issued.push({uid,claims});return 'fixture-token';}},config,now:()=>clock,verifyIdentity:async(token,audience)=>{assert.equal(audience,config.origin+'/api-server/api/auth/engine/session');if(token!=='fixture-oidc')throw Error();return identity;}});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  afterEach(()=>new Promise(resolve=>server.close(resolve)));
  const post=async(path='',headers={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/auth/engine/session'+path,{method:'POST',headers});
  const begin=async()=>{const response=await post('',{Origin:config.origin});assert.equal(response.status,201);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/Secure/);return {...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};};
  return {docs,issued,user,config,post,begin,expire:()=>clock+=600001,setIdentity:v=>identity=v};
}
test('approval and redemption require Main identity and the same browser; redemption is one-use',async t=>{
 const f=await fixture(t),r=await f.begin(), headers={Origin:f.config.origin,Cookie:r.cookie};
 assert.equal((await f.post('/'+r.requestId,headers)).status,202);
 assert.equal((await f.post('/'+r.requestId+'/approve')).status,401);
 assert.equal((await f.post('/'+r.requestId+'/approve',{Authorization:'Bearer bad'})).status,401);
 assert.equal((await f.post('/'+r.requestId+'/approve',{Authorization:'Bearer fixture-oidc'})).status,200);
 assert.equal((await f.post('/'+r.requestId+'/approve',{Authorization:'Bearer fixture-oidc'})).status,409);
 assert.equal((await f.post('/'+r.requestId,{Origin:f.config.origin})).status,403);
 assert.equal((await f.post('/'+r.requestId,{...headers,Origin:'https://attacker.test'})).status,403);
 assert.equal((await f.post('/'+r.requestId,headers)).status,200);
 assert.equal((await f.post('/'+r.requestId,headers)).status,410);
 assert.equal(f.issued.length,1);assert.equal(f.issued[0].uid,'owner-fixture');
});
test('expiry, wrong principal, stale identity and removed owner privilege fail closed',async t=>{
 const f=await fixture(t),r=await f.begin();
 for(const identity of [{email:'other@fixture.iam.gserviceaccount.com',email_verified:true,iat:1800000000},{email:f.config.principal,email_verified:false,iat:1800000000},{email:f.config.principal,email_verified:true,iat:1}]){
 f.setIdentity(identity);assert.equal((await f.post('/'+r.requestId+'/approve',{Authorization:'Bearer fixture-oidc'})).status,403);
 }
 f.setIdentity({email:f.config.principal,email_verified:true,iat:1800000000});f.user.customClaims={roles:['admin']};
 assert.equal((await f.post('/'+r.requestId+'/approve',{Authorization:'Bearer fixture-oidc'})).status,403);
 f.user.customClaims={admin:true};f.expire();
 assert.equal((await f.post('/'+r.requestId,{Origin:f.config.origin,Cookie:r.cookie})).status,410);assert.equal(f.issued.length,0);
});
test('cross-site creation, forged cookies, and creation flood are denied',async t=>{
 const f=await fixture(t);assert.equal((await f.post('',{Origin:'https://attacker.test'})).status,403);
 const r=await f.begin();assert.equal((await f.post('/'+r.requestId,{Origin:f.config.origin,Cookie:'__session=fluba-engine-'+'0'.repeat(64)})).status,403);
 for(let i=0;i<4;i++)await f.begin();
 assert.equal((await f.post('',{Origin:f.config.origin})).status,429);
});
