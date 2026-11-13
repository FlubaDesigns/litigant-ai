import { describe, expect, it } from "vitest";
import { authPath, safeNext, signInErrorMessage } from "./authUtils";

describe("safe auth return destinations", () => {
  it.each(["/billing", "/session/saved-123?tab=verdict#evidence", "/session?template=memo&question=a%20b", "/history?q=https%3A%2F%2Fexample.com"])("preserves local destination %s", next => {
    expect(safeNext(next)).toBe(next);
    for (const page of ["/sign-in", "/register", "/verify-email", "/forgot-password"] as const) {
      expect(new URLSearchParams(authPath(page, next).split("?")[1]).get("next")).toBe(next);
    }
  });

  it.each([undefined, null, "", "https://evil.example/", "//evil.example/", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)", "/%2fexample.com", "/%5cexample.com", "/%09/example.com", "/%ZZ", " /billing"])("rejects unsafe or absent destination %s", next => {
    expect(safeNext(next)).toBe("/session");
  });

  it("validates again when creating an intermediate auth link", () => {
    expect(authPath("/register", "//evil.example")).toBe("/register?next=%2Fsession");
  });
});

it.each(["/sign-in", "/sign-in?next=%2Fadmin", "/register/", "/verify-email", "/forgot-password", "/%73ign-in"])("prevents authentication return loops for %s", path => {
  expect(safeNext(path)).toBe("/session");
});
it.each(["auth/invalid-credential", "auth/popup-closed-by-user", "auth/popup-blocked", "auth/network-request-failed", "auth/too-many-requests", "auth/unauthorized-domain"])("provides recovery instructions for %s without raw errors", code => {
  const message = signInErrorMessage({code, message: "private provider diagnostic"});
  expect(message).not.toContain("private provider diagnostic");
  expect(message.length).toBeGreaterThan(50);
});
