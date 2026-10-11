import {beforeEach, afterEach, describe, expect, it, vi} from "vitest";
vi.mock("react", async original => ({...await original<typeof import("react")>(), useState:vi.fn(), useEffect:vi.fn(), useReducer:vi.fn(), useRef:vi.fn(), useCallback:vi.fn()}));
vi.mock("wouter",()=>({Link:"a",useLocation:()=>["/history",vi.fn()]}));
vi.mock("firebase/auth",()=>({updateProfile:vi.fn(),updateEmail:vi.fn(),updatePassword:vi.fn(),EmailAuthProvider:{credential:vi.fn()},reauthenticateWithCredential:vi.fn()}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:vi.fn()}));
vi.mock("@/lib/firebase",()=>({auth:{currentUser:{uid:"owner",getIdToken:async()=>"fixture-token"}}}));
vi.mock("@/lib/apiUrl",()=>({API_BASE:"/api"}));
vi.mock("@/hooks/useLimits",()=>({useLimits:vi.fn(()=>({maxLitigants:10}))}));
vi.mock("@/hooks/useArtifactAccess",()=>({useArtifactAccess:()=>true}));
vi.mock("@/services/sessionService",()=>({runBrainSession:vi.fn(),updateSession:vi.fn(),getSessions:vi.fn(),getSession:vi.fn(),deleteSession:vi.fn(),generateShareLink:vi.fn(),exportSessionAsMarkdown:vi.fn(),exportAccountData:vi.fn(),deleteAccount:vi.fn()}));
vi.mock("@/hooks/useConfiguration",()=>({useTemplates:()=>({data:[]})}));
vi.mock("@/services/firestoreService",()=>({getUserProfile:vi.fn(),updateUserProfile:vi.fn(),USER_ROLE_LABELS:{individual:"Individual"}}));
vi.mock("@/pages/app/session/ConfigPanel",()=>({ConfigPanel:"div"}));
vi.mock("@/services/providerService",()=>({getProviders:vi.fn()}));
vi.mock("@/components/SiteHeader",()=>({SiteHeader:"header"}));
vi.mock("@/components/SiteFooter",()=>({SiteFooter:"footer"}));
vi.mock("@/components/GuestTrialNotice",()=>({GuestTrialNotice:"aside"}));
vi.mock("@/components/ui/button",()=>({Button:"button"}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn()}}));
import {useState,useEffect,useReducer,useRef,useCallback} from "react";
import {useLimits} from "@/hooks/useLimits";
import {useAuth} from "@/contexts/AuthContext";
import {toast} from "sonner";
import {AppLayout} from "@/components/AppLayout";
import {OnboardingWizard} from "@/components/OnboardingWizard";
import {useBrainSession,_reducerForTests as reducer,_makeInitialStateForTests as initial} from "@/hooks/useBrainSession";
import {SessionCourt} from "@/pages/app/session/SessionCourt";
import HistoryPage from "@/pages/app/History";
import SettingsPage from "@/pages/app/Settings";
import {runBrainSession,getSession,exportAccountData} from "@/services/sessionService";
const dispatch=vi.fn();
const user={uid:"owner",email:"owner@example.test",providerData:[],getIdToken:vi.fn(async()=>"fixture-token")};
function walk(node:any,fn:(n:any)=>boolean):any {if(Array.isArray(node)){for(const child of node){const found=walk(child,fn);if(found)return found;}return;}if(!node?.props)return;if(fn(node))return node;return walk(node.props.children,fn);}
function texts(node:any):string {if(Array.isArray(node))return node.map(texts).join(" "); if(typeof node==="string" || typeof node==="number")return String(node); if(!node?.props)return "";return texts(node.props.children);}
let storage: Map<string,string>;
beforeEach(()=>{
  vi.clearAllMocks(); storage=new Map();
  vi.mocked(useLimits).mockReturnValue({maxLitigants:10} as any);
  vi.stubGlobal("sessionStorage",{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  vi.stubGlobal("window",{location:{pathname:"/history",search:""}});
  vi.mocked(useState).mockImplementation(((v:any)=>[typeof v==="function"?v():v,vi.fn()]) as any);
  vi.mocked(useEffect).mockImplementation(()=>{});
  vi.mocked(useRef).mockImplementation(((v:any)=>({current:v})) as any);
  vi.mocked(useCallback).mockImplementation(((v:any)=>v) as any);
  vi.mocked(useReducer).mockImplementation(((_r:any,value:any,init:any)=>[init(value),dispatch]) as any);
  vi.mocked(useAuth).mockReturnValue({user,userProfile:{plan:"pro"},firebaseReady:true} as any);
  user.getIdToken.mockResolvedValue("fixture-token");
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function court(state=initial(),props:any={}) {return SessionCourt({state,isRunning:state.phase==="running",isComplete:state.phase==="complete",isPaused:state.phase==="paused",isRelayNeeded:state.phase==="relay_needed",isError:state.phase==="error",credits:100,estimatedCredits:20,feedbackGiven:null,rebuttalChallenge:"",fieldValues:{},...props} as any);}
describe("onboarding save/retry and defaults",()=>{
  it.each([500,200])("does not dismiss for unconfirmed save (%s) and retains choices for retry",async status=>{
    storage.set("lai:onboarding:owner",JSON.stringify({step:4,prefs:{litigantCount:2,responseMode:"thorough",outputFormat:"memo"}}));
    const complete=vi.fn(); const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({saved:false}),{status})).mockResolvedValueOnce(new Response(JSON.stringify({saved:true})));
    vi.stubGlobal("fetch",fetch);const tree=OnboardingWizard({onComplete:complete});const finish=walk(tree,n=>n.props.onClick?.name==="handleFinish").props.onClick;
    await finish();expect(complete).not.toHaveBeenCalled();expect(toast.error).toHaveBeenCalled();expect(storage.get("lai:onboarding:owner")).toContain("thorough");
    await finish();expect(complete).toHaveBeenCalledOnce();expect(storage.has("lai:onboarding:owner")).toBe(false);expect(JSON.parse(fetch.mock.calls[1][1].body).defaultSettings.litigantCount).toBe(2);
  });
  it("retains draft after network failure and ignores repeated clicks while saving",async()=>{
    let reject!: (reason:Error)=>void;vi.stubGlobal("fetch",vi.fn(()=>new Promise((_r,j)=>{reject=j;})));
    const complete=vi.fn();const tree=OnboardingWizard({onComplete:complete});const finish=walk(tree,n=>n.props.onClick?.name==="handleFinish").props.onClick;
    const first=finish();await Promise.resolve();await finish();expect(fetch).toHaveBeenCalledOnce();reject(new Error("Offline"));await first;expect(complete).not.toHaveBeenCalled();
  });
  it("does not mount the first session until the profile confirms the saved defaults, even with a delayed snapshot",async()=>{
    const chosen={litigantCount:2,responseMode:"thorough" as const,outputFormat:"memo" as const};
    const refresh=vi.fn(async()=>{});
    vi.mocked(useAuth).mockReturnValue({user,firebaseReady:true,userProfile:{onboardingComplete:false,defaultSettings:{litigantCount:4}},retryAccountSetup:refresh} as any);
    const waiting=AppLayout({children:"FIRST_SESSION"});expect(texts(waiting)).not.toContain("FIRST_SESSION");
    await walk(waiting,n=>n.type===OnboardingWizard).props.onComplete();
    expect(texts(AppLayout({children:"FIRST_SESSION"}))).not.toContain("FIRST_SESSION");
    vi.mocked(useAuth).mockReturnValue({user,firebaseReady:true,userProfile:{onboardingComplete:true,defaultSettings:chosen},retryAccountSetup:refresh} as any);
    expect(texts(AppLayout({children:"FIRST_SESSION"}))).toContain("FIRST_SESSION");expect(initial(chosen).config).toMatchObject(chosen);
    const edited=reducer(initial(),{type:"SET_CONFIG",config:{litigantCount:3}});expect(reducer(edited,{type:"LOAD_DEFAULTS",config:chosen}).config.litigantCount).toBe(3);
  });
});
describe("stopping, interrupted output and stale callbacks",()=>{
  it("binds accessible Stop and preserves partial text without claiming completion",()=>{
    let state=reducer(initial(),{type:"SESSION_STARTED",sessionId:"run",estimatedCredits:20});state={...state,question:"Question"};
    state=reducer(state,{type:"ROLE_START",role:"Builder",round:1,roleIndex:-1,provider:"fixture"});state=reducer(state,{type:"CONTENT_CHUNK",role:"Builder",content:"PARTIAL_MARKER"});
    const stop=vi.fn();expect(walk(court(state,{onStop:stop}),n=>n.props["aria-label"]==="Stop session").props.onClick).toBe(stop);
    state=reducer(state,{type:"STOP_LOCAL",savedMemory:true});expect(state.phase).toBe("cancelled");expect(state.transcript).toContain("PARTIAL_MARKER");expect(state.stopPersistence).toBe("pending");expect(texts(court(state))).toContain("PARTIAL_MARKER");expect(texts(court(state))).toContain("not an approved result");
  });
  it("restores exact transcript boundaries and the incomplete-provider reason, hiding acceptance",()=>{
    const state=reducer(initial(),{type:"RESTORE_SESSION",session:{id:"cut",question:"Q",status:"incomplete",pauseReason:"output_incomplete",artifacts:"DRAFT",transcriptLines:["body with\n\n---\n\nseparator"],courtroomOutcome:{reason:"output_incomplete"}} as any});
    expect(state.phase).toBe("paused");expect(state.pauseTranscript).toHaveLength(1);expect(state.pauseReason).toBe("output_incomplete");
    expect(texts(court(state))).toContain("Retry incomplete session");expect(texts(court(state))).not.toContain("Accept answer");expect(texts(court(state))).toContain("DRAFT");
  });
  it("Stop before token completion never starts a request; repeated Stop is a no-op",async()=>{
    let resolve!: (token:string)=>void;user.getIdToken.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const hook=useBrainSession();const running=hook.run("Question");hook.stop();hook.stop();resolve("fixture-token");await running;
    expect(runBrainSession).not.toHaveBeenCalled();expect(dispatch.mock.calls.filter(([action])=>action.type==="STOP_LOCAL")).toHaveLength(1);
  });
  it("ignores stale completion after Stop and confirms saved cancelled partial data",async()=>{
    let callback:any;let finish!:()=>void;
    vi.mocked(runBrainSession).mockImplementation((_request,onEvent)=>{callback=onEvent;onEvent({type:"start",sessionId:"run"});return new Promise(r=>{finish=r;});});
    vi.mocked(getSession).mockResolvedValue({id:"run",status:"cancelled",transcript:"SAVED_PARTIAL",creditsUsed:0,settlementStatus:"pending",creditsReserved:25} as any);
    const hook=useBrainSession();const running=hook.run("Question");await Promise.resolve();hook.stop();callback({type:"done",status:"complete",sessionId:"run"});finish();await running;await Promise.resolve();
    expect(dispatch.mock.calls.some(([action])=>action.type==="SESSION_DONE")).toBe(false);
    const restore=dispatch.mock.calls.find(([action])=>action.type==="RESTORE_SESSION")![0];expect(restore.session.status).toBe("cancelled");
    expect(texts(court(reducer(initial(),restore)))).toMatch(/25\s+credits still reserved/);
  });
  it("Free Stop never reads saved memory",async()=>{
    vi.mocked(useAuth).mockReturnValue({user,userProfile:{plan:"free"},firebaseReady:true} as any);
    let finish!:()=>void;vi.mocked(runBrainSession).mockImplementation((_request,onEvent)=>{onEvent({type:"start",sessionId:"run"});return new Promise(r=>{finish=r;});});
    const hook=useBrainSession();const running=hook.run("Question");await Promise.resolve();hook.stop();finish();await running;
    expect(getSession).not.toHaveBeenCalled();expect(dispatch).toHaveBeenCalledWith({type:"STOP_LOCAL",savedMemory:false});
  });
  it("keeps an unconfirmed save explicit after a cancelled result cannot be read",async()=>{
    vi.useFakeTimers();let finish!:()=>void;vi.mocked(runBrainSession).mockImplementation((_request,onEvent)=>{onEvent({type:"start",sessionId:"run"});return new Promise(r=>{finish=r;});});vi.mocked(getSession).mockRejectedValue(new Error("Unavailable"));
    const hook=useBrainSession();const running=hook.run("Question");await Promise.resolve();hook.stop();finish();await running;await vi.advanceTimersByTimeAsync(31000);
    expect(dispatch).toHaveBeenCalledWith({type:"STOP_UNCONFIRMED"});
  });
});
describe("history and export presentation",()=>{
  it("keeps Load more reachable on empty filtered pages, including search/template filters",()=>{
    const values=[[],false,false,true,"cursor","older","all","template",null,null,false];let index=0;vi.mocked(useState).mockImplementation((()=>[values[index++],vi.fn()]) as any);
    expect(texts(HistoryPage())).toContain("Load more");
  });
  it("does not hide server matches when the search has surrounding whitespace or legacy missing fields",()=>{
    const values=[[{id:"one",question:"invoice",templateId:null}],false,false,false,null," invoice ","all","all",null,null,false];let index=0;vi.mocked(useState).mockImplementation((()=>[values[index++],vi.fn()]) as any);
    const tree=HistoryPage();expect(walk(tree,n=>n.props.session?.id==="one")).toBeTruthy();
  });
  it("downloads complete export content without selecting metadata-only fields, and does not download on failure",async()=>{
    vi.mocked(useState).mockImplementation(((v:any)=>[v==="profile"?"danger":typeof v==="function"?v():v,vi.fn()]) as any);
    vi.mocked(exportAccountData).mockResolvedValueOnce({user:{uid:"owner"},sessions:[{id:"s",finalAnswer:"ANSWER",transcript:"TRANSCRIPT",artifacts:"DOCUMENT"}]}).mockRejectedValueOnce(new Error("read failed"));
    let blob!:Blob;vi.spyOn(URL,"createObjectURL").mockImplementation(b=>{blob=b as Blob;return "blob:fixture";});vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});const click=vi.fn();vi.stubGlobal("document",{createElement:()=>({click})});
    const tab=walk(SettingsPage(),n=>n.type?.name==="DangerTab");const tree=tab.type(tab.props);const handler=walk(tree,n=>n.props.onClick?.name==="handleExportData").props.onClick;
    await handler();expect(await blob.text()).toContain("DOCUMENT");expect(await blob.text()).toContain("TRANSCRIPT");await handler();expect(click).toHaveBeenCalledOnce();expect(toast.error).toHaveBeenCalled();
  });
});

describe("continuation retry context",()=>{
  it("restores the missing-info prompt, previous document and exact transcript after a failed relay request",async()=>{
    const previous={...initial(),phase:"relay_needed" as const,sessionId:"parent",question:"Question",relayQuestion:"Which jurisdiction?",artifacts:"DRAFT_TO_KEEP",transcript:"PRIOR",pauseTranscript:["EXACT\n\n---\n\nLINE"],relayCount:1};
    vi.mocked(useReducer).mockReturnValue([previous,dispatch] as any);
    vi.mocked(runBrainSession).mockRejectedValue(new Error("Network interrupted"));
    const hook=useBrainSession();await hook.submitRelay("California");
    const failed=dispatch.mock.calls.find(([action])=>action.type==="RECOVERY_FAILED")![0];
    const recovered=reducer({...previous,phase:"running",relayQuestion:null,artifacts:"",runtimeFeed:[]},failed);
    expect(recovered.phase).toBe("relay_needed");expect(recovered.relayQuestion).toBe("Which jurisdiction?");expect(recovered.artifacts).toBe("DRAFT_TO_KEEP");
    await hook.submitRelay("California");
    expect(runBrainSession).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runBrainSession).mock.calls[1][0].relayContext?.originalTranscript).toEqual(["EXACT\n\n---\n\nLINE"]);
  });
  it("restores continuation after error SSE without advertising a completed result",async()=>{
    const previous={...initial(),phase:"paused" as const,sessionId:"paused",question:"Q",pauseReason:"iteration_limit" as const,finalAnswer:"PRIOR_ANSWER"};
    vi.mocked(useReducer).mockReturnValue([previous,dispatch] as any);
    vi.mocked(runBrainSession).mockImplementation(async(_request,onEvent)=>{onEvent({type:"error",message:"Retryable provider error"});});
    const hook=useBrainSession();await hook.continueSession();
    const failed=dispatch.mock.calls.find(([action])=>action.type==="RECOVERY_FAILED")![0];const recovered=reducer({...previous,phase:"running"},failed);
    expect(recovered.phase).toBe("paused");expect(recovered.finalAnswer).toBe("PRIOR_ANSWER");expect(recovered.errorMessage).toContain("Retryable");
  });
  it("keeps a missing-info prompt reachable when final delivery is also incomplete",()=>{
    const state={...initial(),phase:"paused" as const,pauseReason:"output_incomplete" as const,relayQuestion:"Which jurisdiction?",courtroomOutcome:{reason:"output_incomplete" as const,confidenceAtExit:0,round:1}};
    const text=texts(court(state));expect(text).toContain("Which jurisdiction?");expect(text).toContain("Submit to court");expect(text).not.toContain("Retry incomplete session");expect(text).not.toContain("Accept answer");
  });
  it("does not allow a second concurrent run or let late SSE overwrite a reset",async()=>{
    let callback:any;let finish!:()=>void;vi.mocked(runBrainSession).mockImplementation((_request,onEvent)=>{callback=onEvent;return new Promise(r=>{finish=r;});});
    const hook=useBrainSession();const running=hook.run("Q");await hook.run("Q again");expect(runBrainSession).toHaveBeenCalledOnce();hook.reset();callback({type:"done",status:"complete",sessionId:"old"});finish();await running;
    expect(dispatch.mock.calls.some(([action])=>action.type==="SESSION_DONE")).toBe(false);
  });
});


describe("onboarding current-limit reconciliation",()=>{
  it("clamps a persisted draft at save time if the saved administrator limit decreased",async()=>{
    storage.set("lai:onboarding:owner",JSON.stringify({step:4,prefs:{litigantCount:4,responseMode:"thorough",outputFormat:"memo"}}));
    vi.mocked(useLimits).mockReturnValue({maxLitigants:2} as any);
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({saved:true}))));
    const tree=OnboardingWizard({onComplete:vi.fn()});await walk(tree,n=>n.props.onClick?.name==="handleFinish").props.onClick();
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).defaultSettings.litigantCount).toBe(2);
  });
});
