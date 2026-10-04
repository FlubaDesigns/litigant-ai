import {afterEach, describe, expect, it, vi} from "vitest";
import {QueryObserver, focusManager, onlineManager} from "@tanstack/react-query";
import {queryClient, CONFIGURATION_REFRESH, refreshConfiguration} from "./queryClient";
vi.mock("@/lib/firebase", () => ({auth:null}));
import {setFeatureFlag} from "@/services/adminService";

const cleanups: (() => void)[] = [];
function watch(key: string[], fn: () => Promise<any>, enabled = true) {
  const observer = new QueryObserver(queryClient, {queryKey:key, queryFn:fn, ...CONFIGURATION_REFRESH, retry:false, enabled});
  cleanups.push(observer.subscribe(() => {}));
  return observer;
}
afterEach(() => {cleanups.splice(0).forEach(f => f()); queryClient.clear(); vi.unstubAllGlobals();});
describe("shared configuration refresh", () => {
  it("shares requests, updates all readers, and preserves good data after errors", async () => {
    let value = 1;
    const read = vi.fn(async () => value);
    const first = watch(["configuration","providers"],read);
    const second = watch(["configuration","providers"],read);
    await vi.waitFor(() => expect(second.getCurrentResult().data).toBe(1));
    expect(read).toHaveBeenCalledTimes(1);
    value = 2; refreshConfiguration();
    await vi.waitFor(() => expect(first.getCurrentResult().data).toBe(2));
    expect(second.getCurrentResult().data).toBe(2);
    read.mockRejectedValue(new Error("offline")); refreshConfiguration();
    await vi.waitFor(() => expect(first.getCurrentResult().isError).toBe(true));
    expect(first.getCurrentResult().data).toBe(2);
  });
  it("refreshes idle quotes without fetching disabled active-session quotes or altering drafts", async () => {
    const activeRead = vi.fn(async () => 8), idleRead = vi.fn(async () => 12);
    const active = watch(["session-quote","active"],activeRead,false);
    const idle = watch(["session-quote","idle"],idleRead);
    const draft = {question:"Keep my question",model:"selected-model"};
    queryClient.setQueryData(["draft"],draft);
    await vi.waitFor(() => expect(idle.getCurrentResult().data).toBe(12));
    refreshConfiguration();
    await vi.waitFor(() => expect(idleRead).toHaveBeenCalledTimes(2));
    expect(activeRead).not.toHaveBeenCalled();
    expect(active.getCurrentResult().fetchStatus).toBe("idle");
    expect(queryClient.getQueryData(["draft"])).toBe(draft);
  });
  it("refreshes immediately after a successful Admin save, but not a failed save", async () => {
    const read = vi.fn(async () => ({enabled:true}));
    watch(["configuration","feature-flags"],read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    vi.stubGlobal("fetch",vi.fn(async () => new Response("{}",{status:200})));
    await setFeatureFlag("guestMode",true);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    vi.stubGlobal("fetch",vi.fn(async () => new Response("{}",{status:500})));
    await expect(setFeatureFlag("guestMode",false)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("refreshes fresh configuration on focus and reconnect", async () => {
    queryClient.mount();
    try {
      const read = vi.fn(async () => 10);
      watch(["configuration","limits"],read);
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      focusManager.setFocused(false); focusManager.setFocused(true);
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
      onlineManager.setOnline(false); onlineManager.setOnline(true);
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    } finally { queryClient.unmount(); }
  });
});
