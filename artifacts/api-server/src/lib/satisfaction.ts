import { createHash } from "node:crypto";
export function satisfactionId(userId:string,sessionId:string):string {
  return `satisfaction_${createHash("sha256").update(JSON.stringify([userId,sessionId])).digest("hex")}`;
}

import { AggregateField, type Firestore } from "firebase-admin/firestore";
import type { SatisfactionSummary } from "@workspace/api-zod/satisfaction";

/** These numeric fields are reserved to the strict satisfaction submission
 * schema; historical good/bad/warn feedback has none of them. Each aggregate
 * uses a single-field index. One read-only snapshot keeps all three aligned.
 */
export async function readSatisfactionSummary(db:Firestore):Promise<SatisfactionSummary> {
  const keys=["answered","satisfied","reuse"] as const;
  return db.runTransaction(async tx=>{
    const results=await Promise.all(keys.map(async field=>(await tx.get(
      db.collection("feedback").where(field,">=",1).aggregate({count:AggregateField.count(),average:AggregateField.average(field)}),
    )).data()));
    const count=results[0]!.count;
    if (results.some(r=>r.count!==count || (count>0 && (typeof r.average!=="number" || !Number.isFinite(r.average) || r.average<1 || r.average>5)))) throw Error("Inconsistent satisfaction records");
    const averages={answered:results[0]!.average,satisfied:results[1]!.average,reuse:results[2]!.average};
    return {count,averages,overall:count?(averages.answered!+averages.satisfied!+averages.reuse!)/3:null};
  },{readOnly:true});
}
