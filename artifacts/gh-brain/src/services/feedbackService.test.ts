import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({configured:true,addDoc:vi.fn()}));
vi.mock("@/lib/firebase",()=>({db:{},get isConfigured(){return mocks.configured;}}));
vi.mock("firebase/firestore",()=>({collection:(_db:unknown,name:string)=>name,addDoc:mocks.addDoc,serverTimestamp:()=>"timestamp"}));
import {submitFeedback} from "./feedbackService";
const entry={userId:"user",sessionId:"session",turnId:"turn",role:"Verdict",rating:"bad" as const};
beforeEach(()=>{mocks.configured=true;mocks.addDoc.mockReset();});
it("writes feedback to the same collection read by the admin flags",async()=>{
  await submitFeedback(entry);
  expect(mocks.addDoc).toHaveBeenCalledWith("feedback",{...entry,createdAt:"timestamp"});
});
it("rejects unavailable feedback instead of confirming a saved flag",async()=>{
  mocks.configured=false;
  await expect(submitFeedback(entry)).rejects.toThrow("unavailable");
  expect(mocks.addDoc).not.toHaveBeenCalled();
});
it("propagates a rejected save so the user can retry",async()=>{
  mocks.addDoc.mockRejectedValue(new Error("Save failed"));
  await expect(submitFeedback(entry)).rejects.toThrow("Save failed");
});
