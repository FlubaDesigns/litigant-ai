import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({ db: "mock-db" }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => "user-ref"), updateDoc: vi.fn(), getDoc: vi.fn(), onSnapshot: vi.fn() }));
import { doc, updateDoc } from "firebase/firestore";
import { updateEmailNotifications } from "./firestoreService";
afterEach(() => vi.clearAllMocks());

describe("notification preference field updates", () => {
  it.each([true, false])("writes the two active preferences, sessionComplete=%s, preserving sibling values or absence", async enabled => {
    await updateEmailNotifications("user-1", enabled, true);
    expect(doc).toHaveBeenCalledWith("mock-db", "users", "user-1");
    expect(updateDoc).toHaveBeenCalledExactlyOnceWith("user-ref", { "notifications.sessionComplete": enabled, "notifications.reengagement": true });
  });
  it("propagates failed writes for retry instead of reporting success", async () => {
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error("offline"));
    await expect(updateEmailNotifications("user-1", false, false)).rejects.toThrow("offline");
  });
});
