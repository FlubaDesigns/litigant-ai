import { describe, expect, it } from "vitest";
import { authPath, safeNext } from "./authUtils";

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
