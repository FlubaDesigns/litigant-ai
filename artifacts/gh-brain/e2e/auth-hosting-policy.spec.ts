import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// Use the deployed header source, not a second relaxed test policy. Every
// external request is mocked or aborted; this test never signs in or calls Auth.
const { hosting } = JSON.parse(readFileSync(new URL("../../../firebase.json", import.meta.url), "utf8"));
const hostingHeaders = Object.fromEntries(hosting.headers.find((entry: any) => entry.source === "**").headers.map((header: any) => [header.key, header.value]));
const helperScript = "https://apis.google.com/js/api.js";
const helperFrame = "https://litigant-ai.firebaseapp.com/__/auth/iframe";

test.use({ ignoreHTTPSErrors: false, bypassCSP: false });

for (const origin of ["https://litigant-ai.com", "https://www.litigant-ai.com", "https://litigant-ai.web.app"]) {
  test(`Hosting headers admit Google helpers and block unrelated resources at ${origin}`, async ({ page }) => {
    const requests: string[] = [];
    await page.route("**/*", async route => {
      const url = route.request().url();
      requests.push(url);
      if (url === `${origin}/auth-policy-fixture`) {
        await route.fulfill({ headers: { ...hostingHeaders, "Content-Type": "text/html" }, body: '<!doctype html><title>Auth policy fixture</title><script>window.inlineScriptRan = true;</script>' });
      } else if (url === helperScript) {
        await route.fulfill({ contentType: "application/javascript", body: 'window.googleBootstrapLoaded = true; const script = document.createElement("script"); script.src = "https://apis.google.com/_/scs/apps-static/_/js/mock-iframe-module"; document.head.append(script);' });
      } else if (url === "https://apis.google.com/_/scs/apps-static/_/js/mock-iframe-module") {
        await route.fulfill({ contentType: "application/javascript", body: "window.googleIframeModuleLoaded = true;" });
      } else if (url === helperFrame) {
        await route.fulfill({ contentType: "text/html", body: '<!doctype html><script>parent.postMessage("firebase-helper-ready", "*");</script>' });
      } else {
        // No unexpected OAuth, account, or other network traffic is permitted.
        await route.abort();
      }
    });
    await page.addInitScript(() => {
      (window as any).policyViolations = [];
      document.addEventListener("securitypolicyviolation", event => {
        (window as any).policyViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      });
      window.addEventListener("message", event => {
        if (event.origin === "https://litigant-ai.firebaseapp.com" && event.data === "firebase-helper-ready") {
          (window as any).firebaseHelperLoaded = true;
        }
      });
    });
    const response = await page.goto(`${origin}/auth-policy-fixture`);
    expect(response?.headers()["content-security-policy"]).toBe(hostingHeaders["Content-Security-Policy"]);
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    await page.evaluate(({ scriptUrl, frameUrl }) => {
      for (const src of [scriptUrl, "https://untrusted.example/script.js"]) {
        const script = document.createElement("script"); script.src = src; document.head.append(script);
      }
      for (const src of [frameUrl, "https://untrusted.example/frame", "https://another-project.firebaseapp.com/__/auth/iframe"]) {
        const frame = document.createElement("iframe"); frame.src = src; document.body.append(frame);
      }
    }, { scriptUrl: helperScript, frameUrl: helperFrame });
    await expect.poll(() => page.evaluate(() => Boolean((window as any).googleBootstrapLoaded && (window as any).googleIframeModuleLoaded && (window as any).firebaseHelperLoaded))).toBe(true);
    expect(await page.evaluate(() => (window as any).inlineScriptRan)).toBeUndefined();
    await expect.poll(() => page.evaluate(() => (window as any).policyViolations)).toEqual(expect.arrayContaining([
      expect.objectContaining({ directive: "script-src-elem", blocked: "inline" }),
      expect.objectContaining({ directive: "script-src-elem", blocked: "https://untrusted.example/script.js" }),
      expect.objectContaining({ directive: "frame-src", blocked: "https://untrusted.example" }),
      expect.objectContaining({ directive: "frame-src", blocked: "https://another-project.firebaseapp.com" }),
    ]));
    expect(requests).toContain(helperScript);
    expect(requests).toContain(helperFrame);
    expect(requests.some(url => url.includes("untrusted.example") || url.includes("another-project.firebaseapp.com"))).toBe(false);
  });
}
