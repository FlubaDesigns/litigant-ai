import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(), GoogleAuthProvider: class {},
  signOut: vi.fn(), updateProfile: vi.fn(), deleteUser: vi.fn(), sendEmailVerification: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/apiUrl", () => ({ API_BASE: "/api" }));

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { ensureAccountSetup, signInWithEmail, signInWithGoogle, signUpWithEmail, signOut } from "./authService";

const user = { uid: "existing-user", getIdToken: vi.fn(async () => "test-token") } as any;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await signOut();
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => response({ provisioned: true }));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as any);
  vi.mocked(signInWithPopup).mockResolvedValue({ user } as any);
  vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user } as any);
});
afterEach(() => vi.unstubAllGlobals());

describe("confirmed account provisioning", () => {
  it.each([401, 500])("surfaces HTTP %s instead of completing sign-in", async status => {
    fetchMock.mockResolvedValue(response({ error: "Unavailable" }, status));
    await expect(signInWithEmail("test@example.com", "test-password")).rejects.toThrow("Retry setup");
  });

  it.each([{ provisioned: false }, {}, null])("rejects an unconfirmed successful HTTP response: %s", async body => {
    fetchMock.mockResolvedValue(response(body));
    await expect(signInWithGoogle()).rejects.toThrow("Retry setup");
  });

  it("allows retry after a network failure without signing in or creating an account again", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expect(signInWithEmail("test@example.com", "test-password")).rejects.toThrow("Retry setup");
    await expect(ensureAccountSetup(user)).resolves.toBeUndefined();
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it("makes the auth observer wait for the same in-progress setup request", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const login = signInWithEmail("test@example.com", "test-password");
    const observer = ensureAccountSetup(user);
    let ready = false;
    void observer.then(() => { ready = true; });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(ready).toBe(false);
    finish(response({ provisioned: true }));
    await Promise.all([login, observer]);
    expect(ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains signup details for a failed setup retry on the same account", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "Unavailable" }, 500));
    await expect(signUpWithEmail("test@example.com", "test-password", "Test", "attorney", "Test Org"))
      .rejects.toThrow("Retry setup");
    await ensureAccountSetup(user);
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body)))
      .toEqual([{ role: "attorney", organization: "Test Org" }, { role: "attorney", organization: "Test Org" }]);
    await ensureAccountSetup(user);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({});
  });

  it("provisions restored logins with a freshly verified token", async () => {
    await ensureAccountSetup(user);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/provision", expect.objectContaining({ method: "POST" }));
  });
});
