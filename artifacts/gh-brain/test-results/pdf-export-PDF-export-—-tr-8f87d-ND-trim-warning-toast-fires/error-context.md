# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pdf-export.spec.ts >> PDF export — trim guard >> long content (>15 000 chars): PDF downloads AND trim warning toast fires
- Location: e2e/pdf-export.spec.ts:70:3

# Error details

```
Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://2bc7216c-3112-4806-a45d-fb63cb185ae4-00-21aabxfgxor81.worf.replit.dev/session?e2e=1
Call log:
  - navigating to "https://2bc7216c-3112-4806-a45d-fb63cb185ae4-00-21aabxfgxor81.worf.replit.dev/session?e2e=1", waiting until "domcontentloaded"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This page isn’t working" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: 2bc7216c-3112-4806-a45d-fb63cb185ae4-00-21aabxfgxor81.worf.replit.dev
      - text: is currently unable to handle this request.
    - generic [ref=e10]: HTTP ERROR 502
  - button "Reload" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * PDF export end-to-end tests.
  5  |  *
  6  |  * These tests use two dev-only hooks that were added alongside this test file:
  7  |  *
  8  |  * 1. ?e2e=1 URL param  — ProtectedRoute skips Firebase auth checks in DEV mode
  9  |  *    so we can access /session without signing in.
  10 |  *
  11 |  * 2. window.__testPdfExport(finalAnswer) — registered by SessionPage's useEffect
  12 |  *    (DEV only). Injects a completed session state (phase="complete",
  13 |  *    config.format="pdf") with the supplied finalAnswer, making the output panel
  14 |  *    and PDF download button visible without running a real AI session.
  15 |  */
  16 | 
  17 | const SESSION_URL = "/session?e2e=1";
  18 | 
  19 | async function loadSessionPage(page: import("@playwright/test").Page) {
> 20 |   await page.goto(SESSION_URL, { waitUntil: "domcontentloaded" });
     |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://2bc7216c-3112-4806-a45d-fb63cb185ae4-00-21aabxfgxor81.worf.replit.dev/session?e2e=1
  21 |   // Wait for React to mount and the dev hook to register
  22 |   await page.waitForFunction(
  23 |     () => typeof (window as any).__testPdfExport === "function",
  24 |     { timeout: 15_000 }
  25 |   );
  26 | }
  27 | 
  28 | async function injectCompletedSession(
  29 |   page: import("@playwright/test").Page,
  30 |   finalAnswer: string
  31 | ) {
  32 |   await page.evaluate((fa) => {
  33 |     (window as any).__testPdfExport(fa);
  34 |   }, finalAnswer);
  35 | 
  36 |   // Wait for the output panel to appear (phase transitions to "complete")
  37 |   await page.waitForSelector('button:has-text("PDF")', { timeout: 10_000 });
  38 | }
  39 | 
  40 | test.describe("PDF export — trim guard", () => {
  41 |   test("short content: PDF downloads and only success toast fires", async ({
  42 |     page,
  43 |   }) => {
  44 |     await loadSessionPage(page);
  45 | 
  46 |     const shortAnswer = "The court finds in favour of the claimant.";
  47 |     await injectCompletedSession(page, shortAnswer);
  48 | 
  49 |     // Start watching for a download triggered by jsPDF's doc.save()
  50 |     const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  51 | 
  52 |     // Click the "PDF" download button (not the "Print" button)
  53 |     // It is the button whose exact text is "PDF" — Print comes right after it
  54 |     await page.locator('button', { hasText: /^PDF$/ }).click();
  55 | 
  56 |     // The download must succeed
  57 |     const download = await downloadPromise;
  58 |     expect(download.suggestedFilename()).toMatch(/brain-session-\d+\.pdf/);
  59 | 
  60 |     // Success toast must appear
  61 |     await expect(page.locator("text=PDF downloaded")).toBeVisible({
  62 |       timeout: 5_000,
  63 |     });
  64 | 
  65 |     // Warning toast must NOT appear
  66 |     const warningToast = page.locator("text=trimmed");
  67 |     await expect(warningToast).not.toBeVisible();
  68 |   });
  69 | 
  70 |   test("long content (>15 000 chars): PDF downloads AND trim warning toast fires", async ({
  71 |     page,
  72 |   }) => {
  73 |     await loadSessionPage(page);
  74 | 
  75 |     // 20 000 chars — well over the 15 000 char limit
  76 |     const longAnswer = "A".repeat(20_000);
  77 |     await injectCompletedSession(page, longAnswer);
  78 | 
  79 |     const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  80 | 
  81 |     await page.locator('button', { hasText: /^PDF$/ }).click();
  82 | 
  83 |     // The download must succeed even for trimmed content
  84 |     const download = await downloadPromise;
  85 |     expect(download.suggestedFilename()).toMatch(/brain-session-\d+\.pdf/);
  86 | 
  87 |     // Success toast must appear
  88 |     await expect(page.locator("text=PDF downloaded")).toBeVisible({
  89 |       timeout: 5_000,
  90 |     });
  91 | 
  92 |     // Warning toast must ALSO appear
  93 |     await expect(page.locator("text=trimmed")).toBeVisible({
  94 |       timeout: 5_000,
  95 |     });
  96 |   });
  97 | });
  98 | 
```