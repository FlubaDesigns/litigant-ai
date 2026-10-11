import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({ db: "mock-db" }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => "user-ref"), updateDoc: vi.fn(), getDoc: vi.fn(), onSnapshot: vi.fn() }));
import { doc, updateDoc } from "firebase/firestore";
import { updateSessionCompleteNotification } from "./firestoreService";
afterEach(() => vi.clearAllMocks());

describe("notification preference field updates", () => {
  it.each([true, false])("writes only sessionComplete=%s, preserving sibling values or absence", async enabled => {
    await updateSessionCompleteNotification("user-1", enabled);
    expect(doc).toHaveBeenCalledWith("mock-db", "users", "user-1");
    expect(updateDoc).toHaveBeenCalledExactlyOnceWith("user-ref", { "notifications.sessionComplete": enabled });
  });
  it("propagates failed writes for retry instead of reporting success", async () => {
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error("offline"));
    await expect(updateSessionCompleteNotification("user-1", false)).rejects.toThrow("offline");
  });
});
