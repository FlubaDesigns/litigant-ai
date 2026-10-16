import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LITMUS_TESTS, evaluateSeatReview, type SeatReview } from "@workspace/api-zod/evaluation";
import { auth } from "@/lib/firebase";
import { getApiUrl } from "@/lib/apiUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

async function reviews(method = "GET", data?: SeatReview) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in as an administrator.");
  const response = await fetch(getApiUrl("/admin/seat-evaluations"), {
    method, headers: {Authorization:`Bearer ${await user.getIdToken()}`, "Content-Type":"application/json"},
    ...(data ? {body: JSON.stringify(data)} : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not load evaluations");
  return result;
}

function ReviewForm() {
  const [seatId, setSeatId] = useState("orchestrator");
  const [model, setModel] = useState("");
  const [source, setSource] = useState("");
  const [response, setResponse] = useState("");
  const [judgments, setJudgments] = useState<Record<string, {met?:boolean; evidence:string}>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const rubric = LITMUS_TESTS[seatId];
  async function save() {
    setBusy(true); setMessage("");
    try {
      const review = {seatId, model, source, response,
        pass:rubric.passCriteria.map((_,i) => judgments[`pass-${i}`]),
        fail:rubric.failCriteria.map((_,i) => judgments[`fail-${i}`])};
      const assessed = evaluateSeatReview(review);
      const {seatId:seat, model:m, source:s, response:r, pass, fail} = assessed;
      await reviews("POST", {seatId:seat, model:m, source:s, response:r, pass, fail});
      setMessage(`Saved: ${assessed.score}/100 for this sample. ${assessed.passed ? "All criteria passed." : "Review criteria failed."}`);
      await qc.invalidateQueries({queryKey:["seat-evaluations"]});
    } catch { setMessage("Could not save. Complete every assessment and evidence field, or retry if the service is unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <label className="block">Seat<select aria-label="Evaluation seat" className="block bg-background border p-2" value={seatId} disabled={busy} onChange={e => {setSeatId(e.target.value);setJudgments({});setMessage("");}}>
      {Object.values(LITMUS_TESTS).map(r => <option key={r.seatId} value={r.seatId}>{r.label}</option>)}
    </select></label>
    <p className="text-sm">Test prompt: {rubric.testPrompt}</p>
    <label className="block">Model ID<Input value={model} maxLength={200} disabled={busy} onChange={e=>setModel(e.target.value)} /></label>
    <label className="block">Source or session reference<Input value={source} maxLength={1000} disabled={busy} onChange={e=>setSource(e.target.value)} /></label>
    <label className="block">Actual model response<Textarea value={response} maxLength={50000} rows={6} disabled={busy} onChange={e=>setResponse(e.target.value)} /></label>
    {(["pass","fail"] as const).map(kind => <fieldset key={kind} className="space-y-2"><legend className="font-semibold">{kind === "pass" ? "Required criteria" : "Automatic failure criteria"}</legend>
      {(kind === "pass" ? rubric.passCriteria : rubric.failCriteria).map((criterion,i) => {
        const key=`${kind}-${i}`, item=judgments[key] ?? {evidence:""};
        return <div key={key} className="space-y-1"><label className="block">{criterion}
          <select aria-label={criterion} className="block bg-background border p-2" disabled={busy} value={item.met === undefined ? "" : String(item.met)} onChange={e=>setJudgments({...judgments,[key]:{...item,met:e.target.value === "" ? undefined : e.target.value === "true"}})}>
            <option value="">Not assessed</option><option value="true">Yes</option><option value="false">No</option>
          </select></label>
          <label className="block text-sm">Evidence or explanation<Textarea maxLength={2000} disabled={busy} value={item.evidence} onChange={e=>setJudgments({...judgments,[key]:{...item,evidence:e.target.value}})} /></label>
        </div>;
      })}
    </fieldset>)}
    <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save sample review"}</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}
export function SeatEvaluationPanel() {
  const [open,setOpen] = useState(false);
  const {data,isError,refetch} = useQuery({queryKey:["seat-evaluations"],queryFn:()=>reviews(),enabled:open});
  return <details className="lgt-card lgt-card--compact" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Review AI quality samples</summary>
    <p className="my-3 text-sm text-muted-foreground">Assess actual answers against each seat’s rubric. These reviews do not automatically change model selection scores or establish calibrated accuracy.</p>
    {open && <ReviewForm />}
    <h3 className="mt-4 font-semibold">Recent saved reviews</h3>
    {isError ? <Button variant="outline" onClick={()=>refetch()}>Retry loading reviews</Button> :
      <ul>{(data?.reviews ?? []).map((r:SeatReview & {id:string;score:number;passed:boolean;rubricVersion:string})=><li key={r.id} className="break-words">
        <details><summary className="cursor-pointer">{r.model} · {r.seatId} · {r.score}/100 · {r.passed?"Passed":"Failed"}</summary>
          <p>Source: {r.source} · Rubric: {r.rubricVersion}</p>
          <p className="whitespace-pre-wrap">{r.response}</p>
          <ul>{(["pass","fail"] as const).flatMap(kind => (r[kind] ?? []).map((item,i)=><li key={`${kind}-${i}`}>
            {kind === "pass" ? "Required" : "Failure"} criterion {i+1}: {item.met?"Yes":"No"} — {item.evidence}
          </li>))}</ul>
        </details>
      </li>)}</ul>}
  </details>;
}
