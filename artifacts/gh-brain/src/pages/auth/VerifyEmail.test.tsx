import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock("wouter", () => ({ Link: "a", useLocation: vi.fn() }));
vi.mock("firebase/auth", () => ({ reload: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/lib/apiUrl", () => ({ API_BASE: "/api" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { reload } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import VerifyEmailPage from "./VerifyEmail";
import { AccountSetupNotice } from "@/components/AccountSetupNotice";

const navigate = vi.fn(), retry = vi.fn();
let context: any;
function findCheck(node: any): any {
  if (!node?.props) return;
  if (node.props.onClick?.name === "handleVerifyCheck") return node;
  for (const child of [node.props.children].flat()) {
    const found = findCheck(child);
    if (found) return found;
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  context = { user: { emailVerified: false, getIdToken: vi.fn(() => Promise.resolve("test-token")) },
    loading: false, setupError: null, retryAccountSetup: retry };
  vi.mocked(useState).mockImplementation(((value: any) => [value, vi.fn()]) as any);
  vi.mocked(useEffect).mockImplementation(effect => { effect(); });
  vi.mocked(useLocation).mockReturnValue(["/verify-email", navigate]);
  vi.mocked(useAuth).mockImplementation(() => context);
  vi.mocked(reload).mockImplementation(async () => { context.user.emailVerified = true; });
});

describe("verification uses the account readiness flow", () => {
  it("waits for setup after reload and surfaces failure without navigating", async () => {
    let fail!: (reason: Error) => void;
    retry.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const pending = findCheck(VerifyEmailPage()).props.onClick();
    await vi.waitFor(() => expect(retry).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    fail(new Error("Retry setup"));
    await pending;
    expect(toast.error).toHaveBeenCalledWith("Retry setup");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not auto-redirect a verified account while setup is pending or failed", () => {
    context.user.emailVerified = true;
    context.loading = true;
    VerifyEmailPage();
    expect(navigate).not.toHaveBeenCalled();
    context.loading = false; context.setupError = "Retry setup";
    expect(VerifyEmailPage().type).toBe(AccountSetupNotice);
    expect(navigate).not.toHaveBeenCalled();
    context.setupError = null;
    VerifyEmailPage();
    expect(navigate).toHaveBeenCalledWith("/session");
  });
});
