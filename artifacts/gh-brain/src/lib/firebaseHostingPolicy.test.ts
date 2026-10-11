import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { hosting } = JSON.parse(readFileSync(new URL("../../../../firebase.json", import.meta.url), "utf8"));
const headers = Object.fromEntries(hosting.headers.find((entry: any) => entry.source === "**").headers.map((header: any) => [header.key, header.value]));
const directives = Object.fromEntries(headers["Content-Security-Policy"].split(";").filter((value: string) => value.trim()).map((value: string) => {
  const [name, ...sources] = value.trim().split(/\s+/);
  return [name, sources];
}));

describe("Firebase Hosting Google OAuth policy", () => {
  it("allows only the Google API script origin and the configured production auth frame origin", () => {
    // Verified public runtime authDomain: litigant-ai.firebaseapp.com. SDK popup
    // helpers load apis.google.com/js/api.js and https://<authDomain>/__/auth/iframe.
    expect(directives["script-src"]).toEqual(["'self'", "https://apis.google.com"]);
    expect(directives["frame-src"]).toEqual(["https://litigant-ai.firebaseapp.com"]);
  });

  it("retains clickjacking, object, form, base, inline-script, and default restrictions", () => {
    for (const name of ["default-src", "frame-ancestors", "object-src"]) expect(directives[name]).toEqual(["'none'"]);
    for (const name of ["form-action", "base-uri"]) expect(directives[name]).toEqual(["'self'"]);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
    expect(directives["script-src"]).not.toContain("*");
    expect(directives["frame-src"]).not.toContain("*");
  });
});
