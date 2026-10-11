import {beforeEach, describe, expect, it, vi} from "vitest";
import express from "express";
import request from "supertest";
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb: vi.fn(), verifyIdToken: vi.fn()}));
vi.mock("../lib/templateStore.js", () => ({getTemplate: vi.fn()}));
import {getFirestoreDb, verifyIdToken} from "../lib/firebaseAdmin.js";
import router from "../routes/sessions.js";
import {sessionCompleteNotificationsEnabled, storedSessionRecord} from "@workspace/api-zod/session";
const app = express(); app.use(express.json(), router);
const auth = {Authorization: "Bearer fixture-token"};
let data: Record<string, any>;
let turnsFail: boolean;
let collectionsRead: string[];
function dbFixture() {
  const ref = (path: string): any => ({path, id: path.split("/").at(-1), async get() { return snapshot(path); }, collection: (name: string) => query(`${path}/${name}`)});
  const snapshot = (path: string): any => ({id:path.split("/").at(-1), exists: path in data, data: () => data[path], ref: ref(path)});
  function query(path: string, filters: [string, unknown][] = [], after?: string, count = Infinity, order?: string): any {
    return {
      doc: (id: string) => ref(`${path}/${id}`),
      where: (field: string, _: string, value: unknown) => query(path,[...filters,[field,value]],after,count,order),
      orderBy: (field: string) => query(path,filters,after,count,field),
      limit: (n: number) => query(path,filters,after,n,order),
      startAfter: (doc: any) => query(path,filters,doc.id,count,order),
      async get() {
        collectionsRead.push(path);
        if (turnsFail && path.endsWith("session_turns")) throw new Error("fixture read interrupted");
        let rows = Object.keys(data).filter(key => key.startsWith(path + "/") && key.slice(path.length+1).indexOf("/") === -1)
          .filter(key => filters.every(([field,value]) => data[key][field] === value)).map(snapshot);
        if (order === "updatedAt") rows.sort((a,b) => (data[b.ref.path].rank ?? 0) - (data[a.ref.path].rank ?? 0));
        else rows.sort((a,b) => a.id.localeCompare(b.id));
        if (order) rows = rows.filter(row => order === "updatedAt" || data[row.ref.path][order] !== undefined);
        if (after) rows = rows.slice(rows.findIndex(doc => doc.id === after) + 1);
        rows = rows.slice(0,count); return {docs: rows, empty: !rows.length};
      },
    };
  }
  return {collection: (name: string) => query(name), runTransaction: async (fn: any) => fn({get: (r: any) => r.get(), update: (r: any, patch: any) => { data[r.path] = {...data[r.path],...patch}; }})};
}
function session(id: string, overrides: any = {}) { data[`sessions/${id}`] = {userId:"owner", title:id, question:`Question ${id}`, status:"complete", rank:1, templateId:null, ...overrides}; }
beforeEach(() => {
  data = {"users/owner": {plan:"pro", email:"owner@example.test", defaultSettings:{litigantCount:2}, notifications:{sessionComplete:false}, squareCustomerId:"PRIVATE_PAYMENT", apiToken:"PRIVATE_TOKEN"}};
  turnsFail = false; collectionsRead = [];
  vi.mocked(verifyIdToken).mockResolvedValue({uid:"owner"} as any);
  vi.mocked(getFirestoreDb).mockReturnValue(dbFixture() as any);
});
describe("owned session pagination and exports", () => {
  it("filters archived and memoryless records before forming the visible page", async () => {
    for(let i=0;i<25;i++) session(`archive-${i}`, {archived:true, rank:100+i});
    session("memoryless", {memorySaved:false,rank:90}); session("kept",{rank:1});
    const res = await request(app).get("/sessions?limit=20").set(auth);
    expect(res.status).toBe(200); expect(res.body.sessions.map((s:any)=>s.id)).toEqual(["kept"]); expect(res.body.hasMore).toBe(false);
  });
  it("advances through bounded empty pages to older search/template matches", async () => {
    for(let i=0;i<501;i++) session(`archive-${i}`,{archived:true,rank:1000+i});
    session("older",{rank:1,question:"Find unique evidence",templateId:"case"});
    const first = await request(app).get("/sessions?search=unique&template=case").set(auth);
    expect(first.body.sessions).toEqual([]); expect(first.body.hasMore).toBe(true);
    const next = await request(app).get(`/sessions?search=unique&template=case&cursor=${first.body.nextCursor}`).set(auth);
    expect(next.body.sessions.map((s:any)=>s.id)).toEqual(["older"]); expect(next.body.hasMore).toBe(false);
  });
  it("paginates matching pages without losing rows and keeps archive access explicit", async () => {
    for(let i=0;i<24;i++) session(`row-${i}`,{rank:i,starred:true}); session("archived",{rank:99,archived:true});
    const a = await request(app).get("/sessions?limit=20&starred=true").set(auth);
    const b = await request(app).get(`/sessions?limit=20&starred=true&cursor=${a.body.nextCursor}`).set(auth);
    expect(new Set([...a.body.sessions,...b.body.sessions].map((s:any)=>s.id)).size).toBe(24);
    const archived = await request(app).get("/sessions?archived=true").set(auth);
    expect(archived.body.sessions.map((s:any)=>s.id)).toEqual(["archived"]);
  });
  it("rejects missing and other-owner cursors", async () => {
    session("other",{userId:"someone-else"});
    for(const id of ["other","missing"]) expect((await request(app).get(`/sessions?cursor=${id}`).set(auth)).status).toBe(400);
  });
  it("exports all paid owned content, archived records, legacy turns and all pages, excluding secrets and other owners", async () => {
    for(let i=0;i<101;i++) session(`saved-${String(i).padStart(3,"0")}`,{artifacts:`DOCUMENT_${i}`,finalAnswer:`ANSWER_${i}`,caseFile:[{content:"EVIDENCE"}],config:{responseMode:"thorough"},archived:true,activeRun:{id:"PRIVATE_LEASE"},shareId:"PRIVATE_SHARE"});
    data["sessions/saved-000/session_turns/turn"]={role:"Litigant 1",content:"LEGACY_TURN",round:1,turnIndex:0};
    data["sessions/saved-000/session_turns/unindexed"]={role:"Moderator",content:"UNINDEXED_LEGACY_TURN",round:1};
    session("not-owned",{userId:"other",finalAnswer:"NOT_OWNED"}); session("free-era",{memorySaved:false,finalAnswer:"NOT_SAVED_MEMORY"});
    const res=await request(app).get("/account/export").set(auth);
    expect(res.status).toBe(200); expect(res.body.sessions).toHaveLength(101);
    for(const marker of ["DOCUMENT_100","ANSWER_100","EVIDENCE","LEGACY_TURN","UNINDEXED_LEGACY_TURN","thorough"]) expect(res.text).toContain(marker);
    for(const marker of ["PRIVATE_PAYMENT","PRIVATE_TOKEN","PRIVATE_LEASE","PRIVATE_SHARE","NOT_OWNED","NOT_SAVED_MEMORY"]) expect(res.text).not.toContain(marker);
    expect(res.body.sessions[0].transcript).toContain("LEGACY_TURN");
  });
  it("Free exports account data only and never queries saved memory or unlocks history", async () => {
    data["users/owner"].plan="free"; session("old",{finalAnswer:"DO_NOT_UNLOCK"});
    const res=await request(app).get("/account/export").set(auth);
    expect(res.status).toBe(200); expect(res.body.user.email).toBe("owner@example.test"); expect(res.body.sessions).toEqual([]);
    expect(collectionsRead).not.toContain("sessions"); expect(res.text).not.toContain("DO_NOT_UNLOCK");
    expect((await request(app).get("/sessions").set(auth)).status).toBe(403);
  });
  it("fails instead of producing an incomplete backup if any content read fails, then supports retry", async () => {
    session("saved"); turnsFail=true;
    const res=await request(app).get("/account/export").set(auth);
    expect(res.status).toBe(500); expect(res.body.sessions).toBeUndefined(); turnsFail=false;
    expect((await request(app).get("/account/export").set(auth)).body.sessions).toHaveLength(1);
  });
  it("requires authentication for exports", async () => {
    expect((await request(app).get("/account/export")).status).toBe(401);
    vi.mocked(verifyIdToken).mockResolvedValue(null);
    expect((await request(app).get("/account/export").set(auth)).status).toBe(401);
  });
  it("cannot accept provider-truncated output through the direct API", async () => {
    session("cutoff",{status:"incomplete",finalAnswer:"PARTIAL",pauseReason:"output_incomplete"});
    const res=await request(app).patch("/sessions/cutoff").set(auth).send({status:"complete"});
    expect(res.status).toBe(409); expect(data["sessions/cutoff"].status).toBe("incomplete");
  });
});
describe("shared account policies", () => {
  it("honors nested notification opt-in and explicit opt-out ahead of legacy values", () => {
    expect(sessionCompleteNotificationsEnabled({notifications:{sessionComplete:true}})).toBe(true);
    expect(sessionCompleteNotificationsEnabled({notifications:{sessionComplete:false},notifySessionComplete:true})).toBe(false);
    expect(sessionCompleteNotificationsEnabled({notifySessionComplete:true})).toBe(true);
    expect(sessionCompleteNotificationsEnabled({})).toBe(false);
  });
  it("keeps financial recovery metadata while stripping all Free session content", () => {
    const result=storedSessionRecord({billingRunId:"run",settlementStatus:"pending",creditsReserved:5,creditsDebited:5,provider:"fallback",modelProvenance:{completed:[{provider:"fallback",model:"model"}]},transcriptLines:["PRIVATE"],artifacts:"PRIVATE",finalAnswer:"PRIVATE"},false);
    expect(result.settlementStatus).toBe("pending"); expect(result.creditsReserved).toBe(5); expect(result.modelProvenance.completed[0].provider).toBe("fallback"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
