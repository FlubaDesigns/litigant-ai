import {afterEach, describe, expect, it, vi} from "vitest";
vi.mock("@/lib/firebase", () => ({auth:null}));
import {getBillingDefaults, getProducts} from "./billingService";
import {getLimits} from "./providerService";

afterEach(() => vi.unstubAllGlobals());

describe("configuration readers do not invent fallback offers", () => {
  it("uses the saved pack and signup allowance even when they differ from stock values", async () => {
    const packs = [{id:"owner-pack",name:"Owner pack",metadata:{creditAmount:"731"},prices:[{unit_amount:823}]}];
    vi.stubGlobal("fetch",vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith("/billing/products") ? {data:packs} : {signupBonusCredits:123}
    ),{status:200})));
    expect(await getProducts()).toEqual(packs);
    expect((await getBillingDefaults()).signupBonusCredits).toBe(123);
  });

  it("keeps a deliberately empty catalogue empty", async () => {
    vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({data:[]}),{status:200})));
    expect(await getProducts()).toEqual([]);
  });

  it("surfaces failed reads instead of substituting prices, credits or limits", async () => {
    vi.stubGlobal("fetch",vi.fn(async () => new Response("Unavailable",{status:503})));
    await expect(getProducts()).rejects.toThrow();
    await expect(getBillingDefaults()).rejects.toThrow();
    await expect(getLimits()).rejects.toThrow();
  });

  it("accepts saved court limits and rejects a malformed response", async () => {
    vi.stubGlobal("fetch",vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({limits:{maxLitigants:7,overdraftLimit:12}})))
      .mockResolvedValueOnce(new Response("{}")));
    expect(await getLimits()).toEqual({maxLitigants:7,overdraftLimit:12});
    await expect(getLimits()).rejects.toThrow("Invalid platform limits response");
  });
});
