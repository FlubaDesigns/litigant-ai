import {describe,it,expect,vi,beforeEach} from "vitest";
import {TEMPLATES} from "@workspace/api-zod/templates";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getTemplates} from "../lib/templateStore.js";
beforeEach(()=>vi.clearAllMocks());
describe("shared template catalogue",()=>{
  it("rejects a failed saved-template read instead of substituting stock offers",async()=>{
    vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({get:async()=>{throw Object.assign(new Error("Unavailable"),{code:14});}})} as any);
    await expect(getTemplates()).rejects.toThrow("Saved templates could not be loaded");
  });
  it("normalizes admin overrides and honors inactive templates",async()=>{
    vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({get:async()=>({docs:[
      {id:TEMPLATES[0].id,data:()=>({title:"Updated title",defaultConfig:{litigantCount:2}})},
      {id:TEMPLATES[1].id,data:()=>({isActive:false})},
    ]})})} as any);
    const result=await getTemplates();
    expect(result.find(t=>t.id===TEMPLATES[0].id)).toMatchObject({title:"Updated title",defaultConfig:{litigantCount:2}});
    expect(result.some(t=>t.id===TEMPLATES[1].id)).toBe(false);
    expect((await getTemplates(true)).some(t=>t.id===TEMPLATES[1].id)).toBe(true);
  });
});

it("upgrades saved stock instructions while preserving customized owner instructions", async () => {
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({get:async()=>({docs:[
    {id:"business-plan",data:()=>({title:"My business plan", systemPrompt:"You are evaluating a business concept for viability, market fit, financial sustainability, and competitive advantage.",defaultConfig:{artifactType:"auto",outputPreferenceMode:"auto",litigantCount:2}})},
    {id:"website-audit",data:()=>({systemPrompt:"Owner's custom audit instructions",defaultConfig:{outputPreferenceMode:"answer-only",artifactType:"none"}})},
  ]})})} as any);
  const result=await getTemplates();
  expect(result.find(t=>t.id==="business-plan")).toMatchObject({title:"My business plan",systemPrompt:TEMPLATES[0].systemPrompt,defaultConfig:{artifactType:"business-plan",outputPreferenceMode:"document",litigantCount:2}});
  expect(result.find(t=>t.id==="website-audit")).toMatchObject({systemPrompt:"Owner's custom audit instructions",defaultConfig:{outputPreferenceMode:"answer-only",artifactType:"none"}});
});

it("corrects saved stock offers while preserving the owner's custom description", async () => {
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({get:async()=>({docs:[
    {id:"website-audit",data:()=>({description:"UX, content, conversion, and technical review of any website."})},
    {id:"product-stress-test",data:()=>({description:"Owner's custom offer"})},
  ]})})} as any);
  const result=await getTemplates();
  expect(result.find(t=>t.id==="website-audit")?.description).toBe(TEMPLATES.find(t=>t.id==="website-audit")!.description);
  expect(result.find(t=>t.id==="product-stress-test")?.description).toBe("Owner's custom offer");
});
