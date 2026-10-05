import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
vi.mock("firebase-admin/app",()=>({initializeApp:vi.fn(),getApps:vi.fn(()=>[]),cert:vi.fn(value=>value)}));
vi.mock("firebase-admin/auth",()=>({getAuth:vi.fn()}));
vi.mock("firebase-admin/firestore",()=>({getFirestore:vi.fn()}));
import {initializeApp,cert,getApps} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {initFirebaseAdmin,verifyIdToken} from "../lib/firebaseAdmin.js";
beforeEach(()=>{vi.clearAllMocks();for(const name of ["FIREBASE_USE_ADC","FIREBASE_PROJECT_ID","FIREBASE_SERVICE_ACCOUNT","FIREBASE_SERVICE_ACCOUNT_JSON_V2","FIREBASE_SERVICE_ACCOUNT_JSON"])vi.stubEnv(name,"");});
afterEach(()=>vi.unstubAllEnvs());
describe("Firebase runtime identity",()=>{
  it("uses explicit keyless identity without parsing a stale service key",()=>{
    vi.stubEnv("FIREBASE_USE_ADC","true");vi.stubEnv("FIREBASE_PROJECT_ID","litigant-ai");vi.stubEnv("FIREBASE_SERVICE_ACCOUNT","stale credential");
    initFirebaseAdmin();expect(initializeApp).toHaveBeenCalledWith({projectId:"litigant-ai"});expect(cert).not.toHaveBeenCalled();
  });
  it("retains explicitly configured certificate support outside keyless deployment",()=>{
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT",JSON.stringify({project_id:"test"}));initFirebaseAdmin();expect(cert).toHaveBeenCalledWith({project_id:"test"});
  });
  it("does not pretend Firebase is configured when identity settings are absent",()=>{
    initFirebaseAdmin();expect(initializeApp).not.toHaveBeenCalled();
  });
});

describe("guest authorization expires across all authenticated routes",()=>{
  beforeEach(()=>{vi.mocked(getApps).mockReturnValue([{}] as any);});
  afterEach(()=>{vi.mocked(getApps).mockReturnValue([]);});
  function setup(anonymous:boolean,expiresAt:number,profile:any={guestInvitationId:"invite"},revoked=false){
    vi.mocked(getAuth).mockReturnValue({verifyIdToken:vi.fn(async()=>({uid:"guest-user",firebase:{sign_in_provider:anonymous?"anonymous":"password"},guestTrial:true,email_verified:false}))} as any);
    vi.mocked(getFirestore).mockReturnValue({collection:(name:string)=>({doc:()=>({get:async()=>({data:()=>name==="users"?profile:{claimedBy:"guest-user",expiresAt:{toMillis:()=>expiresAt},revoked}})})})} as any);
  }
  it("accepts the invited identity without requiring an email",async()=>{
    setup(true,Date.now()+60000);expect(await verifyIdToken("token")).toMatchObject({uid:"guest-user",guest:true,anonymous:true});
  });
  it("denies expired and revoked trials even with an otherwise valid Firebase token",async()=>{
    setup(true,Date.now()-1);expect(await verifyIdToken("token")).toBeNull();
    expect(await verifyIdToken("token",{allowExpiredGuest:true})).toMatchObject({guest:true});
    setup(true,Date.now()+60000,undefined,true);expect(await verifyIdToken("token")).toBeNull();
  });
  it("requires an invitation before anonymous accounts can use protected services",async()=>{
    setup(true,Date.now()+60000,{});expect(await verifyIdToken("token")).toBeNull();
    expect(await verifyIdToken("token",{allowUnclaimedGuest:true})).toMatchObject({anonymous:true,guest:false});
  });
  it("does not let linking credentials bypass an expired invitation",async()=>{
    setup(false,Date.now()-1);expect(await verifyIdToken("token")).toBeNull();
    setup(false,Date.now()-1,{guestInvitationId:null});expect(await verifyIdToken("token")).toMatchObject({guest:false,anonymous:false});
  });
});
