import { useId } from "react";
import "./satisfaction.css";

/** Local adaptation of Kingdom Connects' ★/☆ display and gold .stars styling.
 * Source: kingdom-connects-app 493f3df, public/js/business.js and
 * public/styles/components/business-cards.css. Litigant owns this component;
 * there are no runtime imports, requests or assets from Kingdom Connects.
 */
export function StarRating({label,value,onChange,low,high,disabled=false}:{
  label:string;value:number|undefined;onChange:(value:number)=>void;low:string;high:string;disabled?:boolean;
}) {
  const id=useId();
  return <fieldset className="satisfaction-question" disabled={disabled}>
    <legend>{label}</legend>
    <div className="satisfaction-stars">
      {[1,2,3,4,5].map(star=><label key={star} className="satisfaction-star">
        <input type="radio" name={id} value={star} checked={value===star} onChange={()=>onChange(star)} aria-label={`${star} ${star===1?"star":"stars"}`} />
        <span aria-hidden="true" data-filled={star<=(value??0)}>{star<=(value??0)?"★":"☆"}</span>
      </label>)}
    </div>
    <p className="satisfaction-scale">1 — {low} · 5 — {high}</p>
  </fieldset>;
}
