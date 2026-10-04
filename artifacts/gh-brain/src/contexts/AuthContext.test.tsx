import { beforeEach, describe, expect, it, vi } from "vitest";

// Small hook harness: keeps state/ref slots across renders without browser Firebase.
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn(), useCallback: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null }, isConfigured: true }));
vi.mock("@/services/firestoreService", () => ({ getUserProfile: vi.fn(), onUserProfileSnapshot: vi.fn() }));
vi.mock("@/services/authService", () => ({
  ensureAccountSetup: vi.fn(), signUpWithEmail: vi.fn(), signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(), signOut: vi.fn(), sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(), deleteAccount: vi.fn(),
}));

import { useState, useRef, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile, onUserProfileSnapshot } from "@/services/firestoreService";
import { ensureAccountSetup } from "@/services/authService";
import { AuthProvider } from "./AuthContext";

let slots: any[], cursor: number;
let authChanged: (user: any) => void;
const user = { uid: "existing", getIdTokenResult: vi.fn(async () => ({ claims: {} })) } as any;
const profile = { uid: "existing", credits: 100 } as any;
function render() {
  cursor = 0;
  return AuthProvider({ children: null }).props.value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks(); slots = []; cursor = 0;
  vi.mocked(useState).mockImplementation(((initial: any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], (next: any) => { slots[i] = next; }];
  }) as any);
  vi.mocked(useRef).mockImplementation(((initial: any) => {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: initial });
  }) as any);
  vi.mocked(useCallback).mockImplementation((fn: any) => fn);
  vi.mocked(useEffect).mockImplementationOnce(effect => { effect(); });
  vi.mocked(onAuthStateChanged).mockImplementation(((_auth: any, callback: any) => {
    authChanged = callback; return vi.fn();
  }) as any);
  vi.mocked(ensureAccountSetup).mockResolvedValue();
  vi.mocked(getUserProfile).mockResolvedValue(profile);
  vi.mocked(onUserProfileSnapshot).mockReturnValue(vi.fn());
  (auth as any).currentUser = user;
  render();
});

describe("account readiness gate", () => {
  it("keeps loading until provisioning AND the saved profile are confirmed", async () => {
    const setup = deferred<void>(), saved = deferred<any>();
    vi.mocked(ensureAccountSetup).mockReturnValue(setup.promise);
    vi.mocked(getUserProfile).mockReturnValue(saved.promise);
    authChanged(user);
    expect(render()).toMatchObject({ loading: true, userProfile: null });
    expect(getUserProfile).not.toHaveBeenCalled();
    setup.resolve();
    await vi.waitFor(() => expect(getUserProfile).toHaveBeenCalled());
    expect(render().loading).toBe(true);
    saved.resolve(profile);
    await vi.waitFor(() => expect(render()).toMatchObject({ loading: false, userProfile: profile, setupError: null }));
  });

  it("shows a provisioning failure and retries the existing user", async () => {
    vi.mocked(ensureAccountSetup).mockRejectedValueOnce(new Error("Retry setup"));
    authChanged(user);
    await vi.waitFor(() => expect(render()).toMatchObject({ loading: false, setupError: "Retry setup", userProfile: null }));
    await render().retryAccountSetup();
    expect(render()).toMatchObject({ user, userProfile: profile, loading: false, setupError: null });
    expect(ensureAccountSetup).toHaveBeenCalledTimes(2);
    expect(ensureAccountSetup).toHaveBeenLastCalledWith(user);
  });

  it("does not declare an account ready when its profile is missing", async () => {
    vi.mocked(getUserProfile).mockResolvedValueOnce(null);
    authChanged(user);
    await vi.waitFor(() => expect(render().setupError).toContain("profile could not be loaded"));
    expect(render().loading).toBe(false);
  });

  it("ignores a setup response that arrives after logout", async () => {
    const setup = deferred<void>();
    vi.mocked(ensureAccountSetup).mockReturnValue(setup.promise);
    authChanged(user);
    authChanged(null);
    setup.resolve();
    await vi.waitFor(() => expect(getUserProfile).toHaveBeenCalled());
    expect(render()).toMatchObject({ user: null, userProfile: null, loading: false, isAdmin: false, setupError: null });
    expect(onUserProfileSnapshot).not.toHaveBeenCalled();
  });

  it("makes a broken profile subscription recoverable", async () => {
    authChanged(user);
    await vi.waitFor(() => expect(render().loading).toBe(false));
    const onError = vi.mocked(onUserProfileSnapshot).mock.calls[0][2]!;
    onError(new Error("Connection failed"));
    expect(render().setupError).toContain("Retry setup");
    await render().retryAccountSetup();
    expect(render().setupError).toBeNull();
  });
});
