import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { claimInvitation, convertInvitation, invitationActive, InvitationInput } from "../lib/guestInvitations.js";
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb: vi.fn(), isFirebaseConfigured: () => true}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {addCredits, reserveCredits} from "../lib/creditLedger.js";
import {canCreateArtifacts} from "@workspace/api-zod/session";

function database() {
  const rows = new Map<string, any>();
  let sequence = 0;
  let queue = Promise.resolve();
  const ref = (key: string) => ({key, id:key.split("/").pop(), get:async()=>({exists:rows.has(key),data:()=>rows.get(key)}),
    set:async(data:any,opts?:any)=>{rows.set(key,opts?.merge?{...rows.get(key),...data}:data);}});
  const db = {collection:(name:string)=>({doc:(id=`auto-${++sequence}`)=>ref(`${name}/${id}`)}),
    runTransaction:(work:any)=>{
      const job = queue.then(async()=>{
        const changes: (()=>void)[]=[];
        const tx={get:(r:any)=>r.get(), create:(r:any,d:any)=>{if(rows.has(r.key))throw Error("exists");changes.push(()=>rows.set(r.key,d));},
          set:(r:any,d:any,o:any)=>changes.push(()=>rows.set(r.key,o?.merge?{...rows.get(r.key),...d}:d)),
          update:(r:any,d:any)=>changes.push(()=>rows.set(r.key,{...rows.get(r.key),...d}))};
        const result=await work(tx);for(const change of changes)change();return result;
      });queue=job.catch(()=>{});return job;
    }};
  return {db:db as any, rows};
}
let db: any, rows: Map<string, any>;
function seed(id:string,credits:number,plan="free") {
  rows.set(`guest_invitations/${id}`,{label:id,credits,plan,expiresAt:Timestamp.fromMillis(Date.now()+3600_000),revoked:false,claimedBy:null});
}
async function redeem(id:string,uid:string) {
  const invitation=await claimInvitation(db,id,uid);
  await addCredits(uid,invitation.credits,"admin_adjustment",{source:"guest_invitation",idempotencyKey:`guest_invitation_${id}`});
}
beforeEach(()=>{({db,rows}=database());vi.mocked(getFirestoreDb).mockReturnValue(db);});
describe("individual guest invitations",()=>{
  it("keeps A's 100 Free credits separate from B's 500 Pro credits, with no reset on reopening",async()=>{
    seed("A",100);seed("B",500,"pro");await redeem("A","person-a");await redeem("B","person-b");
    expect(rows.get("users/person-a")).toMatchObject({creditBalance:100,plan:"free"});
    expect(rows.get("users/person-b")).toMatchObject({creditBalance:500,plan:"pro"});
    await reserveCredits("person-a",50,"conversation");await redeem("A","person-a");
    expect(rows.get("users/person-a").creditBalance).toBe(50);
    expect(rows.get("users/person-b").creditBalance).toBe(500);
    expect(await reserveCredits("person-a",51,"too-much")).toBe(false);
    expect(canCreateArtifacts(rows.get("users/person-a").plan)).toBe(false);
    expect(canCreateArtifacts(rows.get("users/person-b").plan)).toBe(true);
  });
  it("lets only one person claim a link, even when requests arrive together",async()=>{
    seed("A",100);
    const results=await Promise.allSettled([redeem("A","person-a"),redeem("A","person-b")]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
    expect([...rows.keys()].filter(k=>k.startsWith("users/"))).toHaveLength(1);
  });
  it("allows only one invitation per guest account",async()=>{
    seed("A",100);seed("B",500,"pro");await redeem("A","person-a");
    await expect(redeem("B","person-a")).rejects.toMatchObject({status:409});
    expect(rows.get("users/person-a").creditBalance).toBe(100);
  });
  it.each(["expired","revoked"])("rejects %s invitations",async reason=>{
    seed("A",100);const invitation=rows.get("guest_invitations/A");
    if(reason==="expired")invitation.expiresAt=Timestamp.fromMillis(Date.now()-1);else invitation.revoked=true;
    expect(invitationActive(invitation)).toBe(false);
    await expect(redeem("A","person-a")).rejects.toMatchObject({status:410});
    expect(rows.has("users/person-a")).toBe(false);
  });
  it("retains ownership of work when signup happens before expiry, even after all credits are spent",async()=>{
    seed("A",100,"pro");await redeem("A","person-a");await reserveCredits("person-a",100,"conversation");
    rows.set("sessions/conversation",{userId:"person-a",artifacts:"Saved document",caseFile:[{content:"Evidence"}]});
    await convertInvitation(db,"person-a","person@example.test","Person A");
    expect(rows.get("users/person-a")).toMatchObject({guestInvitationId:null,plan:"free",creditBalance:0,email:"person@example.test"});
    expect(rows.get("sessions/conversation")).toEqual({userId:"person-a",artifacts:"Saved document",caseFile:[{content:"Evidence"}]});
    expect(await convertInvitation(db,"person-a","person@example.test")).toBe(false);
    await expect(redeem("A","another-person")).rejects.toMatchObject({status:410});
  });
  it("does not convert work after the trial expires",async()=>{
    seed("A",100);await redeem("A","person-a");rows.get("guest_invitations/A").expiresAt=Timestamp.fromMillis(Date.now()-1);
    await expect(convertInvitation(db,"person-a","person@example.test")).rejects.toMatchObject({status:410});
    expect(rows.get("users/person-a").guestInvitationId).toBe("A");
  });
  it("rejects invalid allowances and past expiration",()=>{
    const input={label:"Person",credits:100,plan:"free",expiresAt:new Date(Date.now()+3600_000).toISOString()};
    expect(InvitationInput.safeParse(input).success).toBe(true);
    for(const credits of [0,-1,1.5,100001])expect(InvitationInput.safeParse({...input,credits}).success).toBe(false);
    expect(InvitationInput.safeParse({...input,expiresAt:"2000-01-01T00:00:00Z"}).success).toBe(false);
  });
});
