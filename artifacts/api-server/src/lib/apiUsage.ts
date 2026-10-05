/** Report saved usage for sessions started in the reporting period.
 * Costs are immutable per-call snapshots, never recomputed at today's rates.
 */
export function summarizeApiUsage(sessions: Record<string, any>[]) {
  const byModel = new Map<string, {provider:string;model:string;calls:number;inputTokens:number;outputTokens:number;cachedInputTokens:number;cacheWriteTokens:number;cacheWrite1hTokens:number;costUSD:number;unpricedCalls:number;estimatedCalls:number}>();
  const byDay = new Map<string, {date:string;sessions:number;creditsUsed:number}>();
  let sessionsMissingCallDetails=0, sessionsMissingCredits=0;
  const amount=(n:unknown)=>typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
  for (const session of sessions) {
    const date=session.createdAt?.toDate?.().toISOString().slice(0,10) ?? "Unknown date";
    const day=byDay.get(date) ?? {date,sessions:0,creditsUsed:0};
    day.sessions++;
    day.creditsUsed+=amount(session.creditsUsed);
    if (typeof session.creditsUsed !== "number" || !Number.isFinite(session.creditsUsed) || session.creditsUsed < 0) sessionsMissingCredits++;
    byDay.set(date,day);
    const calls=Array.isArray(session.callUsage) ? session.callUsage : [];
    if (!calls.length) sessionsMissingCallDetails++;
    for (const call of calls) {
      if (!call || typeof call !== "object") continue;
      const provider=typeof call.provider === "string" ? call.provider : "Unknown provider";
      const model=typeof call.model === "string" ? call.model : "Unknown model";
      const key=JSON.stringify([provider,model]);
      const row=byModel.get(key) ?? {provider,model,calls:0,inputTokens:0,outputTokens:0,cachedInputTokens:0,cacheWriteTokens:0,cacheWrite1hTokens:0,costUSD:0,unpricedCalls:0,estimatedCalls:0};
      row.calls++;
      row.inputTokens+=amount(call.inputTokens);row.outputTokens+=amount(call.outputTokens);
      row.cachedInputTokens+=amount(call.cachedInputTokens);
      row.cacheWriteTokens+=amount(call.cacheWriteTokens);row.cacheWrite1hTokens+=amount(call.cacheWrite1hTokens);
      row.costUSD+=amount(call.costUSD);
      if (typeof call.costUSD !== "number" || !Number.isFinite(call.costUSD) || call.costUSD < 0) row.unpricedCalls++;
      if (call.usageSource !== "provider") row.estimatedCalls++;
      byModel.set(key,row);
    }
  }
  const models=[...byModel.values()].sort((a,b)=>b.costUSD-a.costUSD || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  const days=[...byDay.values()].sort((a,b)=>b.date.localeCompare(a.date));
  return {
    totalSessions:sessions.length,
    totalCreditsUsed:days.reduce((sum,d)=>sum+d.creditsUsed,0),
    totalCalls:models.reduce((sum,m)=>sum+m.calls,0),
    totalInputTokens:models.reduce((sum,m)=>sum+m.inputTokens,0),
    totalOutputTokens:models.reduce((sum,m)=>sum+m.outputTokens,0),
    costUSD:models.reduce((sum,m)=>sum+m.costUSD,0),
    sessionsMissingCallDetails,sessionsMissingCredits,
    unpricedCalls:models.reduce((sum,m)=>sum+m.unpricedCalls,0),
    estimatedCalls:models.reduce((sum,m)=>sum+m.estimatedCalls,0),
    byModel:models,byDay:days,
  };
}
