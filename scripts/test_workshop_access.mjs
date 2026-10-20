import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,webcrypto} from 'node:crypto';
import {authorizeWorkshop,exitWorkshop} from '../artifacts/gh-brain/public/__workshop/app-access.mjs';
const key=randomBytes(32).toString('base64url'),generation='a'.repeat(32);
const config={schema:'site-workshop-app/v1',site:'litigant-ai',generation,keyHash:createHash('sha256').update(key).digest('hex')};
function fixture({hash='',state={site:config.site,available:true,underConstruction:true,generation},stored=null,fail=false}={}){
 const storage=new Map();if(stored)storage.set('fluba-workshop:'+config.site,JSON.stringify(stored));
 const location={hash,pathname:'/app',search:''},requests=[];
 return {location,storage,requests,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},history:{replaceState:()=>{location.hash='';}},crypto:webcrypto,fetch:async url=>{requests.push(url);assert(!url.includes(key));if(fail)throw Error('network');return{ok:true,json:async()=>state};}};
}
test('anonymous visits and ordinary URL flags remain on the construction page',async()=>{
 for(const hash of ['', '#preview=true','#workshop='+generation+'.'+'b'.repeat(43)])assert.equal((await authorizeWorkshop(config,fixture({hash}))).allowed,false);
});
test('a current private entrance opens the app, clears the fragment and survives navigation in this tab',async()=>{
 const env=fixture({hash:'#workshop='+generation+'.'+key});assert.deepEqual(await authorizeWorkshop(config,env),{allowed:true,privateVisit:true});assert.equal(env.location.hash,'');assert.equal(env.storage.size,1);assert.equal((await authorizeWorkshop(config,env)).allowed,true);
 exitWorkshop(config.site,env);assert.equal(env.storage.size,0);assert.equal((await authorizeWorkshop(config,env)).allowed,false);
});
test('expired capabilities, generation drift and unavailable status fail closed',async()=>{
 assert.equal((await authorizeWorkshop(config,fixture({stored:{generation,key,expires:1}}))).allowed,false);
 assert.equal((await authorizeWorkshop(config,fixture({hash:'#workshop='+generation+'.'+key,state:{site:config.site,available:true,underConstruction:true,generation:'b'.repeat(32)}}))).allowed,false);
 assert.equal((await authorizeWorkshop(config,fixture({hash:'#workshop='+generation+'.'+key,fail:true}))).allowed,false);
});
test('explicit public reopening uses only this approved generation and digest',async()=>{
 const state={site:config.site,available:true,underConstruction:false,generation,key};assert.deepEqual(await authorizeWorkshop(config,fixture({state})),{allowed:true,privateVisit:false});
 assert.equal((await authorizeWorkshop(config,fixture({state:{...state,key:'b'.repeat(43)}}))).allowed,false);
});
