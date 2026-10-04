import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
vi.mock("firebase-admin/app",()=>({initializeApp:vi.fn(),getApps:vi.fn(()=>[]),cert:vi.fn(value=>value)}));
vi.mock("firebase-admin/auth",()=>({getAuth:vi.fn()}));
vi.mock("firebase-admin/firestore",()=>({getFirestore:vi.fn()}));
import {initializeApp,cert} from "firebase-admin/app";
import {initFirebaseAdmin} from "../lib/firebaseAdmin.js";
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
