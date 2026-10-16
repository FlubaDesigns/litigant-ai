import {expect,it} from "vitest";
import {evaluateSeatReview,LITMUS_TESTS} from "@workspace/api-zod/evaluation";
const sample=()=>({seatId:"builder",model:"tested-model",source:"session-reference",response:"Actual answer under review",pass:LITMUS_TESTS.builder.passCriteria.map(()=>({met:true,evidence:"Reviewed against supplied blueprint"})),fail:LITMUS_TESTS.builder.failCriteria.map(()=>({met:false,evidence:"Not present in this response"}))});
it("does not manufacture a score from an unreviewed answer",()=>{
 expect(()=>evaluateSeatReview({...sample(),pass:[]})).toThrow();
 expect(()=>evaluateSeatReview({...sample(),pass:sample().pass.map(p=>({...p,evidence:""}))})).toThrow();
});
it("records a complete human assessment without claiming calibrated accuracy",()=>{
 expect(evaluateSeatReview(sample())).toMatchObject({score:100,passed:true,calibrated:false,assessmentType:"human-reviewed-sample"});
});
it("any automatic failure prevents approval even when positive criteria pass",()=>{
 const review=sample();review.fail[0].met=true;
 expect(evaluateSeatReview(review)).toMatchObject({score:0,passed:false});
});
