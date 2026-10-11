import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async original => ({...await original<typeof import("react")>(),useState:vi.fn(),useRef:vi.fn()}));
vi.mock("wouter", () => ({useLocation:vi.fn(),useSearch:()=>"",Redirect:"redirect"}));
vi.mock("@/contexts/AuthContext", () => ({useAuth:vi.fn()}));
vi.mock("@/hooks/useGuestInvitation", () => ({useGuestInvitation:()=>({isGuest:false})}));
vi.mock("@/components/ui/button", () => ({Button:"button"}));
vi.mock("@/services/sessionService", async original => ({...await original<typeof import("@/services/sessionService")>(),deleteAccount:vi.fn()}));
vi.mock("sonner", () => ({toast:{success:vi.fn(),error:vi.fn()}}));
import {useState,useRef} from "react";
import {useLocation} from "wouter";
import {useAuth} from "@/contexts/AuthContext";
import {deleteAccount,AccountDeletionError} from "@/services/sessionService";
import {toast} from "sonner";
import {AccountDeletionRecovery} from "./AccountDeletionRecovery";
import {ProtectedRoute} from "./ProtectedRoute";
let state:any[], cursor:number, context:any;
const navigate=vi.fn(), guard={current:false};
const nodes=(node:any):any[]=>node?.props?[node,...[node.props.children].flat().flatMap(nodes)]:[];
const render=()=>{cursor=0;return AccountDeletionRecovery();};
const button=(tree:any,label:string)=>nodes(tree).find(node=>node.type==="button"&&node.props.children===label);
beforeEach(()=>{
 vi.clearAllMocks();state=[];cursor=0;guard.current=false;
 vi.stubEnv("DEV",false);vi.stubGlobal("window",{location:{pathname:"/settings",search:"",hash:""}});
 context={user:{uid:"u",getIdToken:vi.fn(async()=>"token")},logOut:vi.fn(async()=>{}),firebaseReady:true,loading:false,accountDeletionPending:true,setupError:"Profile missing",retryAccountSetup:vi.fn()};
 vi.mocked(useAuth).mockImplementation(()=>context);vi.mocked(useLocation).mockReturnValue(["/settings",navigate]);
 vi.mocked(useRef).mockReturnValue(guard);
 vi.mocked(useState).mockImplementation(((initial:any)=>{const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],(value:any)=>{state[index]=value;}];}) as any);
 vi.mocked(deleteAccount).mockResolvedValue({success:true,code:"deleted",phase:"complete",authDeleted:true,appDataDeleted:true,retryable:false});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("deletion recovery stays available after profile removal",()=>{
 it("takes precedence over the missing-profile setup screen",()=>{
   expect(ProtectedRoute({children:"ordinary app"}).type).toBe(AccountDeletionRecovery);
 });
 it("retries deletion without provisioning and signs out only on full success",async()=>{
   await button(render(),"Retry account deletion").props.onClick();
   expect(deleteAccount).toHaveBeenCalledWith("token");expect(context.retryAccountSetup).not.toHaveBeenCalled();
   expect(context.logOut).toHaveBeenCalledOnce();expect(toast.success).toHaveBeenCalledWith("Account deleted.");expect(navigate).toHaveBeenCalledWith("/");
 });
 it("retains the session and retry control after partial Auth failure",async()=>{
   vi.mocked(deleteAccount).mockRejectedValue(new AccountDeletionError({success:false,code:"deletion_incomplete",phase:"auth",appDataDeleted:true,authDeleted:false,retryable:true,message:"App data removed; sign-in deletion needs retry"}));
   await button(render(),"Retry account deletion").props.onClick();
   expect(context.logOut).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
   expect(button(render(),"Retry account deletion")).toBeDefined();
 });
 it("shows support and disables impossible authenticated retry after Auth cleanup",async()=>{
   vi.mocked(deleteAccount).mockRejectedValue(new AccountDeletionError({success:false,code:"cleanup_required",phase:"profile",appDataDeleted:true,authDeleted:true,retryable:false,message:"Contact support"}));
   await button(render(),"Retry account deletion").props.onClick();
   expect(button(render(),"Retry account deletion")).toBeUndefined();expect(context.logOut).not.toHaveBeenCalled();
 });
 it("prevents repeated clicks while a retry is in flight",async()=>{
   let finish!:(value:any)=>void;vi.mocked(deleteAccount).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
   const click=button(render(),"Retry account deletion").props.onClick;
   const pending=click();await click();await vi.waitFor(()=>expect(deleteAccount).toHaveBeenCalledOnce());
   expect(button(render(),"Deleting…").props.disabled).toBe(true);
   finish({success:true});await pending;
 });
});
