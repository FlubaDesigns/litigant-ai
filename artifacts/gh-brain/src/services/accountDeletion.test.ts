import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/apiUrl", () => ({ getApiUrl: (path:string) => `/api${path}` }));
import { deleteAccount, AccountDeletionError } from "./sessionService";
const complete = { success:true, authDeleted:true, appDataDeleted:true, phase:"complete", code:"deleted", retryable:false };
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch",fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const reply = (body:unknown,status=200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body),{status}));
describe("account deletion confirmation", () => {
  it("requires explicit full completion before success", async () => {
    reply(complete); expect(await deleteAccount("token")).toEqual(complete);
    expect(fetchMock).toHaveBeenCalledWith("/api/account",{method:"DELETE",headers:{Authorization:"Bearer token"}});
  });
  it.each([{success:true,authDeleted:false}, {success:true}, {}, null])("rejects old or incomplete HTTP 200: %s", async body => {
    reply(body); await expect(deleteAccount("token")).rejects.toBeInstanceOf(AccountDeletionError);
  });
  it("preserves honest partial progress and retry", async () => {
    reply({success:false,authDeleted:false,appDataDeleted:true,retryable:true,phase:"auth",message:"Sign-in deletion failed"},503);
    await expect(deleteAccount("token")).rejects.toMatchObject({message:"Sign-in deletion failed",result:{appDataDeleted:true,authDeleted:false,retryable:true}});
  });
  it("does not offer authenticated retries when final cleanup needs support", async () => {
    reply({success:false,authDeleted:true,appDataDeleted:true,retryable:false,phase:"profile",message:"Contact support"},503);
    await expect(deleteAccount("token")).rejects.toMatchObject({result:{retryable:false,authDeleted:true}});
  });
  it("treats lost responses as unknown, never as untouched data", async () => {
    fetchMock.mockRejectedValue(new TypeError("connection closed"));
    await expect(deleteAccount("token")).rejects.toMatchObject({result:{authDeleted:null,appDataDeleted:null,code:"unconfirmed"}});
  });
  it("treats malformed success JSON as unconfirmed", async () => {
    fetchMock.mockResolvedValue(new Response("not-json",{status:200}));
    await expect(deleteAccount("token")).rejects.toMatchObject({result:{code:"unconfirmed"}});
  });
  it("requires sign-in/support when retry authentication is unavailable", async () => {
    reply({message:"Sign in again or contact support"},401);
    await expect(deleteAccount("token")).rejects.toMatchObject({result:{retryable:false}});
  });
});
