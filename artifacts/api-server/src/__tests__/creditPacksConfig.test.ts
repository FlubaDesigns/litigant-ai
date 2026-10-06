import {beforeEach, expect, it, vi} from "vitest";
vi.mock("../lib/firebaseAdmin.js",()=>({getFirestoreDb:vi.fn()}));
import {getFirestoreDb} from "../lib/firebaseAdmin.js";
import {getAllCreditPacks, findCreditPackByPriceId, invalidateCreditPacksCache} from "../lib/creditPacksConfig.js";
import {CREDIT_PACKS} from "../lib/creditPacks.js";
beforeEach(()=>{vi.clearAllMocks();invalidateCreditPacksCache();});

it("uses the saved price for both catalogue display and checkout lookup",async()=>{
  const pack={...CREDIT_PACKS[0],prices:[{...CREDIT_PACKS[0].prices[0],unit_amount:823}]};
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({packs:{[pack.id]:pack}})})})})} as any);
  expect((await getAllCreditPacks())[pack.id].prices[0].unit_amount).toBe(823);
  expect((await findCreditPackByPriceId(pack.prices[0].id))?.price.unit_amount).toBe(823);
});

it("does not replace an unreadable saved price with a stock price",async()=>{
  vi.mocked(getFirestoreDb).mockReturnValue({collection:()=>({doc:()=>({get:async()=>{throw Error("Unavailable");}})})} as any);
  await expect(getAllCreditPacks()).rejects.toThrow("Saved credit packs could not be loaded");
  await expect(findCreditPackByPriceId(CREDIT_PACKS[0].prices[0].id)).rejects.toThrow();
});
