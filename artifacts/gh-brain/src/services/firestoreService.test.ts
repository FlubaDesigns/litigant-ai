import {it, expect, vi} from "vitest";
vi.mock("@/lib/firebase",()=>({db:{}}));
vi.mock("firebase/firestore",()=>({doc:vi.fn(()=>({})),updateDoc:vi.fn(),deleteField:()=>({delete:true}),getDoc:vi.fn(),onSnapshot:vi.fn()}));
import {updateDoc} from "firebase/firestore";
import {updateUserProfile} from "./firestoreService";
it("clears optional fields rather than sending undefined, preserving supplied values",async()=>{
 await updateUserProfile("u",{organization:undefined,role:undefined,displayName:"Alex"});
 const fields=vi.mocked(updateDoc).mock.calls[0][1];
 expect(fields).toEqual({organization:{delete:true},role:{delete:true},displayName:"Alex"});
});
