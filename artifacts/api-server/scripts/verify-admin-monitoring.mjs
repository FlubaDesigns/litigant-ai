// Read-only production smoke check. Never print session content or credentials.
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
initializeApp({projectId:'litigant-ai'});
const db=getFirestore();
const since=new Date(Date.now()-30*86400000),through=new Date();
const checks=[
  ['API usage',()=>db.collection('sessions').where('createdAt','>=',since).where('createdAt','<=',through).orderBy('createdAt','desc').select('createdAt','creditsUsed','callUsage').limit(1).get()],
  ['Session failures',()=>db.collection('sessions').orderBy('lastRunErrorAt','desc').select('lastRunErrorAt','lastRunErrorMessage','title','userId','status').limit(1).get()],
  ['Historical API errors',()=>db.collection('api_logs').where('status','==','error').orderBy('createdAt','desc').limit(1).get()],
  ['Feedback flags',()=>db.collection('feedback').where('rating','in',['bad','warn']).orderBy('createdAt','desc').limit(1).get()],
];
for(const [label,read] of checks){
  for(let attempt=0;;attempt++){
    try{
      const snapshot=await read();
      console.log(`${label}: live query succeeded; ${snapshot.empty?'no matching records':'records available'}.`);
      break;
    }catch(error){
      // Index creation can complete shortly after Firebase deploy returns.
      if(error.code===9 && attempt<30){
        if(attempt===0)console.log(`${label}: waiting for the query index.`);
        await new Promise(resolve=>setTimeout(resolve,10000));continue;
      }
      console.error(`${label}: live query failed (code ${Number.isInteger(error.code)?error.code:'unknown'}).`);
      process.exit(1);
    }
  }
}
await db.terminate();
