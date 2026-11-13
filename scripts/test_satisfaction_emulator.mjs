import {readSatisfactionSummary} from "../artifacts/api-server/src/lib/satisfaction.ts";
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert(/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''),'Local emulator required');
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,AggregateField}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-litigant-readiness'},'satisfaction-test');
const db=getFirestore(app);const refs=['satisfaction-test-a','satisfaction-test-b','satisfaction-test-old'].map(id=>db.collection('feedback').doc(id));
const summary=()=>readSatisfactionSummary(db);
try {
 await refs[0].set({kind:'satisfaction',answered:5,satisfied:4,reuse:3});
 await refs[1].set({kind:'satisfaction',answered:1,satisfied:2,reuse:3});
 await refs[2].set({rating:'good'});
 assert.deepEqual(await summary(),{count:2,overall:3,averages:{answered:3,satisfied:3,reuse:3}});
 await refs[0].set({kind:'satisfaction',answered:3,satisfied:2,reuse:1});
 assert.deepEqual(await summary(),{count:2,overall:2,averages:{answered:2,satisfied:2,reuse:2}});
 await refs[0].delete();await refs[1].delete();
 assert.deepEqual(await summary(),{count:0,overall:null,averages:{answered:null,satisfied:null,reuse:null}});
 console.log('Satisfaction aggregate emulator passed: averages, edit without double count, deletion and empty state.');
} finally {await Promise.all(refs.map(ref=>ref.delete()));await deleteApp(app);}
