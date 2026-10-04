import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("../lib/firebaseAdmin.js", () => ({getFirestoreDb:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getBillingDefaults} from "../lib/billingDefaultsConfig.js";
const get = vi.fn();
beforeEach(() => {
  get.mockReset();
  vi.mocked(getFirestoreDb).mockReturnValue({collection:() => ({doc:() => ({get})})} as any);
});
describe("public billing configuration refresh", () => {
  it("observes a change saved by another server instance on the next read", async () => {
    get.mockResolvedValueOnce({exists:true,data:() => ({signupBonusCredits:123})});
    expect((await getBillingDefaults()).signupBonusCredits).toBe(123);
    get.mockResolvedValueOnce({exists:true,data:() => ({signupBonusCredits:456})});
    expect((await getBillingDefaults()).signupBonusCredits).toBe(456);
  });
  it("does not present factory defaults as a successful refresh when storage fails", async () => {
    get.mockRejectedValueOnce(new Error("temporarily unavailable"));
    await expect(getBillingDefaults()).rejects.toThrow(/unavailable/);
    get.mockResolvedValueOnce({exists:false,data:() => undefined});
    expect((await getBillingDefaults()).signupBonusCredits).toBe(500);
  });
});
