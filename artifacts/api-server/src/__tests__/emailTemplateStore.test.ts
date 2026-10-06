import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/firebaseAdmin.js", () => ({ isFirebaseConfigured: () => true, getFirestoreDb: vi.fn() }));
import { getFirestoreDb } from "../lib/firebaseAdmin.js";
import { getTemplateConfig, saveTemplateVersion, saveTemplateConfig } from "../lib/emailTemplateStore.js";
const get = vi.fn();
const add = vi.fn(async (_value: unknown) => ({ id: "version" }));
const set = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ exists: true, data: () => ({ subject: "Previously saved", enabled: true }) });
  vi.mocked(getFirestoreDb).mockReturnValue({ collection: () => ({ doc: () => ({ get, set, collection: () => ({ add }) }) }) } as any);
});
it("saves a draft version without changing the active email", async () => {
  const draft = { subject: "Draft {name}", headline: "Hello {name}", introText: "New copy" };
  await saveTemplateVersion("welcome", "Draft version", "owner", draft);
  expect(add).toHaveBeenCalledWith(expect.objectContaining(draft));
  expect(set).not.toHaveBeenCalled();
});
it("observes edits from other server instances on the next read", async () => {
  expect((await getTemplateConfig("welcome")).subject).toBe("Previously saved");
  get.mockResolvedValue({ exists: true, data: () => ({ subject: "Latest saved" }) });
  expect((await getTemplateConfig("welcome")).subject).toBe("Latest saved");
});
it("rejects unknown variables and disabling mandatory account emails before writing", async () => {
  await expect(saveTemplateConfig("welcome", { subject: "{unknown}" }, "owner")).rejects.toThrow("Unsupported variable");
  await expect(saveTemplateConfig("verification", { enabled: false }, "owner")).rejects.toThrow("cannot be disabled");
  expect(set).not.toHaveBeenCalled();
});

it("does not enable defaults when saved email settings cannot be read", async () => {
  get.mockRejectedValue(new Error("Firestore unavailable"));
  await expect(getTemplateConfig("welcome")).rejects.toThrow("No email was sent");
});
