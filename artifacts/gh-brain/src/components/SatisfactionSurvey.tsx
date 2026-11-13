import { useEffect, useState, useRef } from "react";
import { SATISFACTION_QUESTIONS, SatisfactionRatingsSchema, type SatisfactionRatings } from "@workspace/api-zod/satisfaction";
import { loadSatisfaction, submitSatisfaction } from "@/services/feedbackService";
import { Button } from "./ui/button";
import { StarRating } from "./StarRating";

export function SatisfactionSurvey({sessionId}:{sessionId:string}) {
  const loaded=useRef<string|null>(null);
  const [open,setOpen]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [ratings,setRatings]=useState<Partial<SatisfactionRatings>>({});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    if (!open || loaded.current===sessionId) return;
    let active=true;setLoading(true);setLoadError(false);setError("");
    loadSatisfaction(sessionId).then(saved=>{if(active){loaded.current=sessionId;setRatings(saved??{});setMessage(saved?"Your ratings are saved. You can update them.":"");}})
      .catch(e=>{if(active){setLoadError(true);setError(e.message);}}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[sessionId,open,attempt]);
  async function save(event:React.FormEvent) {
    event.preventDefault();const parsed=SatisfactionRatingsSchema.safeParse(ratings);
    if (!parsed.success || pending) return;
    setPending(true);setError("");setMessage("");
    try {await submitSatisfaction(sessionId,parsed.data);setMessage("Thank you. Your Satisfaction Score is saved.");}
    catch(e){setError(e instanceof Error?e.message:"Ratings could not be saved. Please retry.");}
    finally{setPending(false);}
  }
  return <details className="satisfaction-survey lgt-card lgt-card--compact" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Rate your experience · optional</summary>
    <p className="text-sm text-muted-foreground">Three quick questions. Choose 1–5 stars for each.</p>
    {loading ? <p role="status">Loading your ratings…</p> : loadError ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>Retry loading ratings</Button></div> :
      <form className="row satisfaction-form" onSubmit={save}>
        {SATISFACTION_QUESTIONS.map(question=><StarRating key={question.id} {...question} value={ratings[question.id]} disabled={pending} onChange={value=>{setRatings(current=>({...current,[question.id]:value}));setMessage("");setError("");}} />)}
        <Button type="submit" disabled={pending||!SatisfactionRatingsSchema.safeParse(ratings).success}>{pending?"Saving…":"Save ratings"}</Button>
        {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
      </form>}
  </details>;
}
