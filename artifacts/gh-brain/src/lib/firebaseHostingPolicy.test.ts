import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { hosting } = JSON.parse(readFileSync(new URL("../../../../firebase.json", import.meta.url), "utf8"));
const headers = Object.fromEntries(hosting.headers.find((entry: any) => entry.source === "**").headers.map((header: any) => [header.key, header.value]));
const directives = Object.fromEntries(headers["Content-Security-Policy"].split(";").filter((value: string) => value.trim()).map((value: string) => {
  const [name, ...sources] = value.trim().split(/\s+/);
  return [name, sources];
}));

describe("Firebase Hosting Google OAuth policy", () => {
  it("loads boot styles and font files from origins allowed by the production policy", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const appCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const fontCss = readFileSync(new URL("../../public/fonts/fonts.css", import.meta.url), "utf8");
    const stylesheetLinks = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0]).filter(tag => /rel=["']stylesheet["']/.test(tag));
    expect(stylesheetLinks.length).toBeGreaterThan(0);
    for (const tag of stylesheetLinks) expect(tag.match(/href=["']([^"']+)["']/)?.[1]).toMatch(/^\/(?!\/)/);
    expect(appCss).not.toMatch(/@import\s+url\(["']?https?:/);
    expect(directives["style-src"]).toContain("'self'");
    expect(directives["font-src"]).toContain("'self'");
    const fonts = [...fontCss.matchAll(/url\(([^)]+)\)/g)].map(match => match[1]);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font).toMatch(/^\/fonts\/[a-z-]+\.woff2$/);
      expect(readFileSync(new URL("../../public" + font, import.meta.url)).subarray(0, 4).toString()).toBe("wOF2");
    }
  });

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
