# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pdf-export.spec.ts >> PDF export — trim guard >> short content: PDF downloads and only success toast fires
- Location: e2e/pdf-export.spec.ts:41:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]: "[plugin:vite:react-babel] /home/runner/workspace/artifacts/gh-brain/src/pages/app/Session.tsx: Identifier 'SeatAssignment' has already been declared. (25:14) 28 | import { SessionConfigure } from \"./session/SessionConfigure\";"
    - generic [ref=e6]: /home/runner/workspace/artifacts/gh-brain/src/pages/app/Session.tsx:25:14
    - generic [ref=e7]: "23 | } from \"@/services/providerService\"; 24 | import { useLimits } from \"@/hooks/useLimits\"; 25 | import type { SeatAssignment } from \"@/data/seatTypes\"; | ^ 26 | import { toast } from \"sonner\"; 27 | import { ConfigPanel } from \"./session/ConfigPanel\";"
    - generic [ref=e8]: at constructor (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:365:19) at TypeScriptParserMixin.raise (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:6616:19) at TypeScriptScopeHandler.declareName (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:4878:21) at TypeScriptParserMixin.declareNameFromIdentifier (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:7584:16) at TypeScriptParserMixin.checkIdentifier (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:7580:12) at TypeScriptParserMixin.checkLVal (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:7517:12) at TypeScriptParserMixin.finishImportSpecifier (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:14283:10) at TypeScriptParserMixin.parseImportSpecifier (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:14436:17) at TypeScriptParserMixin.parseImportSpecifier (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:10165:18) at TypeScriptParserMixin.parseNamedImportSpecifiers (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:14415:36) at TypeScriptParserMixin.parseImportSpecifiersAndAfter (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:14259:37) at TypeScriptParserMixin.parseImport (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:9367:28) at TypeScriptParserMixin.parseStatementContent (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:12893:27) at TypeScriptParserMixin.parseStatementContent (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:9525:18) at TypeScriptParserMixin.parseStatementLike (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:12784:17) at TypeScriptParserMixin.parseModuleItem (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:12761:17) at TypeScriptParserMixin.parseBlockOrModuleBlockBody (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:13333:36) at TypeScriptParserMixin.parseBlockBody (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:13326:10) at TypeScriptParserMixin.parseProgram (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:12639:10) at TypeScriptParserMixin.parseTopLevel (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:12629:25) at TypeScriptParserMixin.parse (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:14505:25) at TypeScriptParserMixin.parse (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:10143:18) at parse (/home/runner/workspace/node_modules/.pnpm/@babel+parser@7.29.3/node_modules/@babel/parser/lib/index.js:14539:38) at parser (/home/runner/workspace/node_modules/.pnpm/@babel+core@7.29.0/node_modules/@babel/core/lib/parser/index.js:41:34) at parser.next (<anonymous>) at normalizeFile (/home/runner/workspace/node_modules/.pnpm/@babel+core@7.29.0/node_modules/@babel/core/lib/transformation/normalize-file.js:64:37) at normalizeFile.next (<anonymous>) at run (/home/runner/workspace/node_modules/.pnpm/@babel+core@7.29.0/node_modules/@babel/core/lib/transformation/index.js:22:50) at run.next (<anonymous>) at transform (/home/runner/workspace/node_modules/.pnpm/@babel+core@7.29.0/node_modules/@babel/core/lib/transform.js:22:33) at transform.next (<anonymous>) at step (/home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:261:32) at /home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:273:13 at async.call.result.err.err (/home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:223:11) at /home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:189:28 at /home/runner/workspace/node_modules/.pnpm/@babel+core@7.29.0/node_modules/@babel/core/lib/gensync-utils/async.js:67:7 at /home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:113:33 at step (/home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:287:14) at /home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:273:13 at async.call.result.err.err (/home/runner/workspace/node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/index.js:223:11)
    - generic [ref=e9]:
      - text: Click outside, press Esc key, or fix the code to dismiss.
      - text: You can also disable this overlay by setting
      - code [ref=e10]: server.hmr.overlay
      - text: to
      - code [ref=e11]: "false"
      - text: in
      - code [ref=e12]: vite.config.ts
      - text: .
  - generic [ref=e13]:
    - generic [ref=e14]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e15] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e16] [cursor=pointer]:
      - img [ref=e17]
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
  20 |   await page.goto(SESSION_URL, { waitUntil: "domcontentloaded" });
  21 |   // Wait for React to mount and the dev hook to register
> 22 |   await page.waitForFunction(
     |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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