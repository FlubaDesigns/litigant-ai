import {beforeEach,afterEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({user:{uid:"user",getIdToken:async()=>"test-token"} as any,fetch:vi.fn()}));
vi.mock("@/lib/firebase",()=>({auth:{get currentUser(){return mocks.user;}}}));
import {submitFeedback} from "./feedbackService";
const entry={userId:"user",sessionId:"session",turnId:"turn",role:"Verdict",rating:"bad" as const};
beforeEach(()=>{mocks.user={uid:"user",getIdToken:async()=>"test-token"};mocks.fetch.mockReset();vi.stubGlobal("fetch",mocks.fetch);});
afterEach(()=>vi.unstubAllGlobals());
it("submits through the authenticated API using the signed-in identity",async()=>{
 mocks.fetch.mockResolvedValue(new Response('{}',{status:201}));
 await submitFeedback({...entry,userId:"forged"});
 const [url,options]=mocks.fetch.mock.calls[0];expect(url).toContain("/feedback");
 expect(options.headers.Authorization).toBe("Bearer test-token");expect(JSON.parse(options.body).userId).toBe("user");
});
it("rejects signed-out submissions",async()=>{
 mocks.user=null;await expect(submitFeedback(entry)).rejects.toThrow("Sign in");expect(mocks.fetch).not.toHaveBeenCalled();
});
it("propagates rate limits so the UI does not confirm a rejected save",async()=>{
 mocks.fetch.mockResolvedValue(new Response('{"error":"Try later"}',{status:429}));
 await expect(submitFeedback(entry)).rejects.toThrow("Try later");
});

it("submits only validated satisfaction ratings with the authenticated owner",async()=>{
 const {submitSatisfaction}=await import('./feedbackService');
 mocks.fetch.mockResolvedValue(new Response('{}',{status:200}));
 await submitSatisfaction('session',{answered:5,satisfied:4,reuse:3});
 expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({kind:'satisfaction',version:1,sessionId:'session',userId:'user',answered:5,satisfied:4,reuse:3});
 await expect(submitSatisfaction('session',{answered:0,satisfied:4,reuse:3})).rejects.toThrow();
 expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it("reloads owned ratings and rejects malformed or failed reads",async()=>{
 const {loadSatisfaction}=await import('./feedbackService');
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ratings:{answered:5,satisfied:4,reuse:3}})));
 expect(await loadSatisfaction('session')).toEqual({answered:5,satisfied:4,reuse:3});
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ratings:{answered:99}})));
 await expect(loadSatisfaction('session')).rejects.toThrow();
 mocks.fetch.mockResolvedValueOnce(new Response('{}',{status:503}));
 await expect(loadSatisfaction('session')).rejects.toThrow('could not be loaded');
});
