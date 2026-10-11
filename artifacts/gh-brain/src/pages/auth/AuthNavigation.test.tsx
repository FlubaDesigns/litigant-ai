import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock("wouter", () => ({ Link: "a", Redirect: "redirect", useLocation: vi.fn(), useSearch: vi.fn() }));
vi.mock("react-hook-form", () => ({ useForm: () => ({ register: vi.fn(), handleSubmit: (handler: unknown) => handler, formState: { errors: {} } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useGuestInvitation", () => ({ useGuestInvitation: vi.fn() }));
vi.mock("@/hooks/usePublicConfig", () => ({ usePublicConfig: () => ({ signupBonusCredits: 500 }) }));
vi.mock("@/services/firestoreService", () => ({ USER_ROLE_LABELS: { attorney: "Attorney" } }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("@/components/ui/label", () => ({ Label: "label" }));
vi.mock("@/components/ui/select", () => ({ Select: "select", SelectContent: "div", SelectItem: "option", SelectTrigger: "button", SelectValue: "span" }));
vi.mock("@/lib/apiUrl", () => ({ API_BASE: "/api" }));
vi.mock("firebase/auth", () => ({ reload: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useGuestInvitation } from "@/hooks/useGuestInvitation";
import { reload } from "firebase/auth";
import { toast } from "sonner";
import SignIn from "./SignIn";
import Register from "./Register";
import VerifyEmail from "./VerifyEmail";
import ForgotPassword from "./ForgotPassword";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const navigate = vi.fn();
const destination = "/session/saved-123?tab=verdict#evidence";
let context: any;
function nodes(node: any): any[] {
  if (!node?.props) return [];
  return [node, ...[node.props.children].flat().flatMap(nodes)];
}
function handler(node: any, name: string) {
  return nodes(node).find(element => element.props.onClick?.name === name).props.onClick;
}
function links(node: any) { return nodes(node).filter(element => element.type === "a").map(element => element.props.href); }
function search(next: string) { vi.mocked(useSearch).mockReturnValue(`next=${encodeURIComponent(next)}`); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  vi.stubGlobal("window", { location: { pathname: "/billing", search: "?pack=starter", hash: "#credit-packs" } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  context = { user: { emailVerified: false, getIdToken: vi.fn(async () => "test-token") }, firebaseReady: true, loading: false, setupError: null,
    signIn: vi.fn(), signUp: vi.fn(), signInGoogle: vi.fn(), logOut: vi.fn(), resetPassword: vi.fn(), retryAccountSetup: vi.fn() };
  vi.mocked(useAuth).mockImplementation(() => context);
  vi.mocked(useGuestInvitation).mockReturnValue({ isGuest: false } as any);
  vi.mocked(useState).mockImplementation(((value: any) => [value, vi.fn()]) as any);
  vi.mocked(useEffect).mockImplementation(effect => { effect(); });
  // Wouter returns pathname only. Query must come from the reactive search hook.
  vi.mocked(useLocation).mockReturnValue(["/register", navigate]);
  search(destination);
  vi.mocked(reload).mockImplementation(async () => { context.user.emailVerified = true; });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("auth destination continuity", () => {
  it.each([SignIn, Register])("returns from Google sign-in to the full safe destination (%s)", async Page => {
    await handler(Page(), "handleGoogleSignIn")();
    expect(context.signInGoogle).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(destination);
  });

  it.each([SignIn, Register])("does not navigate after a canceled/failed Google popup (%s)", async Page => {
    context.signInGoogle.mockRejectedValue(new Error("Popup canceled"));
    await handler(Page(), "handleGoogleSignIn")();
    expect(toast.error).toHaveBeenCalledWith("Popup canceled");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("preserves the destination from registration through verification", async () => {
    await nodes(Register()).find(node => node.type === "form").props.onSubmit({ displayName: "Test", email: "test@example.com", password: "test-password" });
    expect(navigate).toHaveBeenCalledWith(`/verify-email?next=${encodeURIComponent(destination)}`);
    navigate.mockClear();
    vi.mocked(useLocation).mockReturnValue(["/verify-email", navigate]);
    await handler(VerifyEmail(), "handleVerifyCheck")();
    expect(context.retryAccountSetup).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(destination);
  });

  it("preserves the destination after password sign-in", async () => {
    await nodes(SignIn()).find(node => node.type === "form").props.onSubmit({ email: "test@example.com", password: "test-password" });
    expect(navigate).toHaveBeenCalledWith(destination);
  });

  it("keeps the destination through sign-in, registration, and recovery links", () => {
    const query = `?next=${encodeURIComponent(destination)}`;
    expect(links(SignIn())).toContain(`/register${query}`);
    expect(links(SignIn())).toContain(`/forgot-password${query}`);
    expect(links(Register())).toContain(`/sign-in${query}`);
    expect(links(ForgotPassword())).toContain(`/sign-in${query}`);
  });

  it("keeps the destination when restarting verification with a different email", async () => {
    const signOut = nodes(VerifyEmail()).find(node => node.props.onClick && node.props.variant === "ghost");
    await signOut.props.onClick();
    expect(context.logOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`/register?next=${encodeURIComponent(destination)}`);
  });

  it("uses a changed search value after back/forward navigation on the same auth page", async () => {
    SignIn();
    search("/billing?pack=starter");
    await handler(SignIn(), "handleGoogleSignIn")();
    expect(navigate).toHaveBeenCalledWith("/billing?pack=starter");
  });

  it.each([SignIn, Register, VerifyEmail])("rejects protocol-relative destinations on each auth completion (%s)", async Page => {
    search("/\\evil.example");
    if (Page === VerifyEmail) context.user.emailVerified = true;
    const rendered = Page();
    if (Page !== VerifyEmail) await handler(rendered, "handleGoogleSignIn")();
    expect(navigate).toHaveBeenCalledWith("/session");
  });

  it.each(["signed-out", "unverified", "guest"])("keeps query and hash through the %s protected-route gate", mode => {
    vi.mocked(useLocation).mockReturnValue(["/billing", navigate]);
    vi.mocked(useSearch).mockReturnValue("pack=starter");
    if (mode === "signed-out") context.user = null;
    if (mode === "guest") vi.mocked(useGuestInvitation).mockReturnValue({ isGuest: true, ended: false } as any);
    const page = mode === "signed-out" ? "/sign-in" : mode === "guest" ? "/register" : "/verify-email";
    expect(ProtectedRoute({ children: "private" }).props.to).toBe(`${page}?next=${encodeURIComponent("/billing?pack=starter#credit-packs")}`);
  });
});

describe("public onboarding clarity", () => {
  it("links the existing legal pages before signup without adding a consent requirement", () => {
    const tree = Register();
    for (const href of ["/terms", "/privacy"]) {
      const link = nodes(tree).find(node => node.type === "a" && node.props.href === href);
      expect(link).toBeDefined();
      expect(link.props.target).toBe("_blank");
      expect(link.props.rel).toBe("noopener noreferrer");
    }
    expect(nodes(tree).some(node => node.props.type === "checkbox")).toBe(false);
  });

  it("shows a signed-out invitation instead of verification actions or a sent-email claim", () => {
    context.user = null;
    const tree = VerifyEmail();
    expect(links(tree)).toContain(`/sign-in?next=${encodeURIComponent(destination)}`);
    expect(links(tree)).toContain(`/register?next=${encodeURIComponent(destination)}`);
    expect(nodes(tree).some(node => node.props.onClick?.name === "handleVerifyCheck" || node.props.onClick?.name === "handleResend")).toBe(false);
    expect(JSON.stringify(tree)).not.toMatch(/Unknown Operator|signal has been transmitted/);
    expect(fetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("waits for auth loading to settle before showing signed-out links", () => {
    context.user = null; context.loading = true;
    const tree = VerifyEmail();
    expect(nodes(tree).some(node => node.props.role === "status")).toBe(true);
    expect(links(tree).some(href => href.startsWith("/sign-in"))).toBe(false);
    expect(nodes(tree).some(node => node.props.onClick)).toBe(false);
  });

  it("sanitizes the signed-out return destination", () => {
    context.user = null;
    search("/\\evil.example");
    expect(links(VerifyEmail())).toContain("/sign-in?next=%2Fsession");
  });

  it("reports resend failures honestly without navigating or claiming success", async () => {
    context.resendVerification = vi.fn().mockRejectedValue(new Error("Try again later"));
    await handler(VerifyEmail(), "handleResend")();
    expect(toast.error).toHaveBeenCalledWith("Try again later");
    expect(toast.success).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
