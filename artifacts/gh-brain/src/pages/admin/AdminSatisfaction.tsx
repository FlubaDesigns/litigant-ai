import { useQuery } from "@tanstack/react-query";
import { SATISFACTION_QUESTIONS } from "@workspace/api-zod/satisfaction";
import { getSatisfactionSummary } from "@/services/adminService";
import { Button } from "@/components/ui/button";
import { TabSkeleton } from "./AdminShared";
import "@/components/satisfaction.css";
export function SatisfactionTab() {
  const {data,isLoading,isError,refetch,isFetching}=useQuery({queryKey:["admin-satisfaction"],queryFn:getSatisfactionSummary,retry:false});
  if (isLoading) return <TabSkeleton/>;
  if (isError||!data) return <div role="alert"><p>Satisfaction scores could not be loaded.</p><Button onClick={()=>refetch()}>Retry</Button></div>;
  const score=(value:number|null)=>value===null?"No ratings yet":`${value.toFixed(2)} / 5`;
  return <section className="space-y-4" aria-label="Satisfaction Score">
    <div className="lgt-card lgt-card--compact space-y-2">
      <h2>Satisfaction Score</h2><p className="satisfaction-score">{score(data.overall)}</p>
      <p>{data.count} {data.count===1?"response":"responses"} · all time</p>
      <p className="text-sm text-muted-foreground">Average of the three client ratings. Measures satisfaction, not factual accuracy. Updating a session’s ratings replaces that response.</p>
      <Button variant="outline" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Refreshing…":"Refresh scores"}</Button>
    </div>
    <div className="row layout__split-3">{SATISFACTION_QUESTIONS.map(question=><article key={question.id} className="lgt-card lgt-card--compact space-y-2"><h3>{question.label}</h3><p className="satisfaction-score">{score(data.averages[question.id])}</p></article>)}</div>
  </section>;
}
