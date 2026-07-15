# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pdf-export.spec.ts >> PDF export — trim guard >> short content: PDF downloads and only success toast fires
- Location: e2e/pdf-export.spec.ts:41:3

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /brain-session-\d+\.pdf/
Received string:  "litigant-ai-test-question-for-pdf-export-1784092223244.pdf"
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - banner [ref=e4]:
        - generic [ref=e5]:
          - link "Litigant AI LITIGANT-AI Put AI to the question!" [ref=e6] [cursor=pointer]:
            - /url: /session
            - img "Litigant AI" [ref=e7]
            - generic [ref=e8]:
              - generic [ref=e9]: LITIGANT-AI
              - generic [ref=e10]:
                - text: Put
                - emphasis [ref=e11]: AI
                - text: to the question!
          - navigation [ref=e12]:
            - link "New Session" [ref=e13] [cursor=pointer]:
              - /url: /session
              - img [ref=e14]
              - text: New Session
            - link "Templates" [ref=e22] [cursor=pointer]:
              - /url: /templates
              - img [ref=e23]
              - text: Templates
            - link "History" [ref=e27] [cursor=pointer]:
              - /url: /history
              - img [ref=e28]
              - text: History
            - link "Credits" [ref=e32] [cursor=pointer]:
              - /url: /billing
              - img [ref=e33]
              - text: Credits
            - link "Settings" [ref=e35] [cursor=pointer]:
              - /url: /settings
              - img [ref=e36]
              - text: Settings
          - generic [ref=e39]:
            - generic [ref=e40]:
              - img [ref=e41]
              - text: 0 credits
            - generic [ref=e43]: free
            - button "Sign out" [ref=e44]:
              - img
              - text: Sign out
      - main [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e48]:
            - link "Litigant AI LITIGANT-AI Put AI to the question!" [ref=e49] [cursor=pointer]:
              - /url: /session
              - img "Litigant AI" [ref=e50]
              - generic [ref=e51]:
                - generic [ref=e52]: LITIGANT-AI
                - generic [ref=e53]:
                  - text: Put
                  - emphasis [ref=e54]: AI
                  - text: to the question!
            - navigation [ref=e55]:
              - link "New Session" [ref=e56] [cursor=pointer]:
                - /url: /session
                - img [ref=e57]
                - text: New Session
              - link "Templates" [ref=e65] [cursor=pointer]:
                - /url: /templates
                - img [ref=e66]
                - text: Templates
              - link "History" [ref=e70] [cursor=pointer]:
                - /url: /history
                - img [ref=e71]
                - text: History
              - link "Credits" [ref=e75] [cursor=pointer]:
                - /url: /billing
                - img [ref=e76]
                - text: Credits
              - link "Settings" [ref=e78] [cursor=pointer]:
                - /url: /settings
                - img [ref=e79]
                - text: Settings
            - generic [ref=e82]:
              - generic [ref=e83]:
                - img [ref=e84]
                - text: 0 credits
              - generic [ref=e86]: free
              - button "Sign out" [ref=e87]:
                - img
                - text: Sign out
          - main [ref=e88]:
            - generic [ref=e89]:
              - generic [ref=e90]:
                - generic [ref=e91]:
                  - button "⚙ Configure" [ref=e92] [cursor=pointer]
                  - button "📂 Sessions" [ref=e93] [cursor=pointer]
                  - button "↺ New Trial" [ref=e94] [cursor=pointer]
                - generic [ref=e95]:
                  - generic [ref=e96]:
                    - generic [ref=e97]: Balance
                    - generic [ref=e98]: 0 cr
                  - generic [ref=e100]:
                    - generic [ref=e101]: Used
                    - generic [ref=e102]: "3"
                  - generic "Credit estimate" [ref=e104]:
                    - generic [ref=e105]: Est
                    - generic [ref=e106]: ~66
                  - generic [ref=e108]:
                    - generic [ref=e109]: Litigants
                    - generic [ref=e110]: "4"
                  - button "Top up →" [ref=e111] [cursor=pointer]
              - generic [ref=e113]:
                - img [ref=e114]
                - generic [ref=e117]: 4 litigants · adversarial · ~66 cr
              - generic [ref=e119]:
                - generic [ref=e120]:
                  - paragraph [ref=e122]:
                    - generic [ref=e123]: Confidence
                    - generic [ref=e124]: 85% / 90%
                  - paragraph [ref=e128]:
                    - generic [ref=e129]: Credits Used
                    - generic [ref=e130]: 3 / ~66 est
                - generic [ref=e134]:
                  - generic [ref=e135]:
                    - generic [ref=e136]: Orchestrator / Consensus
                    - generic [ref=e137]:
                      - button "⬇" [ref=e138] [cursor=pointer]
                      - button "🖨" [ref=e139] [cursor=pointer]
                  - generic [ref=e140]:
                    - generic [ref=e141]:
                      - generic [ref=e142]: You
                      - text: Test question for PDF export
                    - generic [ref=e143]: Courtroom assembling…
                - generic [ref=e144]:
                  - generic [ref=e145]: Helpful?
                  - button "👍" [ref=e146] [cursor=pointer]
                  - button "👎" [ref=e147] [cursor=pointer]
                  - button "⚠️" [ref=e148] [cursor=pointer]
                  - generic [ref=e149]:
                    - button "Copy" [ref=e150] [cursor=pointer]
                    - button "PDF" [active] [ref=e151] [cursor=pointer]
                    - button "Print" [ref=e152] [cursor=pointer]
                - generic [ref=e153]:
                  - tablist [ref=e154]:
                    - tab "Final Answer" [selected] [ref=e155]
                    - tab "Debate" [ref=e156]
                    - tab "Transcript" [ref=e157]
                    - tab "Caveats" [ref=e158]
                  - tabpanel "Final Answer" [ref=e159]:
                    - generic [ref=e160]:
                      - generic [ref=e161]: Verdict — 85% confidence
                      - generic [ref=e162]: The court finds in favour of the claimant.
                - generic [ref=e163]:
                  - generic [ref=e164]:
                    - generic [ref=e165]: ⚖ Challenge the Verdict
                    - generic [ref=e166]: ~66 cr to reconvene
                  - generic [ref=e167]:
                    - textbox "What did the court miss? What assumption is wrong? State your objection and the court will reconvene…" [ref=e168]
                    - generic [ref=e169]:
                      - button "⚖ Reconvene the Court" [disabled] [ref=e170]
                      - button "New Case" [ref=e171] [cursor=pointer]
                    - generic [ref=e172]:
                      - text: Not enough credits to reconvene.
                      - button "Top up" [ref=e173] [cursor=pointer]
              - generic [ref=e175]:
                - generic [ref=e176]:
                  - generic [ref=e177]: Runtime Control
                  - generic [ref=e178]:
                    - generic [ref=e179]: Runtime Control
                    - generic [ref=e180]:
                      - generic [ref=e181]:
                        - generic [ref=e182]: STARTING
                        - generic [ref=e183]: "3"
                      - generic [ref=e184]:
                        - generic [ref=e185]: CURRENT
                        - generic [ref=e186]: "0"
                      - generic [ref=e187]:
                        - generic [ref=e188]: USED
                        - generic [ref=e189]: "3"
                      - generic [ref=e190]:
                        - generic [ref=e191]: ROUND
                        - generic [ref=e192]: 0 / 5
                      - generic [ref=e193]:
                        - generic [ref=e194]: CREDIT CAP
                        - generic [ref=e195]: —
                  - button "Activity Log ▶" [ref=e197] [cursor=pointer]:
                    - generic [ref=e198]: Activity Log
                    - generic [ref=e199]: ▶
                - generic [ref=e201]:
                  - generic [ref=e202]:
                    - img [ref=e203]:
                      - generic [ref=e221]:
                        - generic [ref=e222]:
                          - generic: User
                        - generic [ref=e227] [cursor=pointer]:
                          - generic: Orch
                          - generic: Claude
                          - generic: A
                        - generic [ref=e231] [cursor=pointer]:
                          - generic: Mod
                          - generic: Claude
                          - generic: A-
                        - generic [ref=e236] [cursor=pointer]:
                          - generic: Aud
                          - generic: Claude
                          - generic: B+
                        - generic [ref=e239] [cursor=pointer]:
                          - generic: Arch
                          - generic: Claude
                          - generic: A
                        - generic [ref=e244] [cursor=pointer]:
                          - generic: Build
                          - generic: Claude
                          - generic: B+
                      - generic [ref=e248]:
                        - generic [ref=e249] [cursor=pointer]:
                          - generic: Claude
                          - generic: L1
                        - generic [ref=e251] [cursor=pointer]:
                          - generic: Claude
                          - generic: L2
                        - generic [ref=e253] [cursor=pointer]:
                          - generic: Claude
                          - generic: L3
                        - generic [ref=e255] [cursor=pointer]:
                          - generic: Claude
                          - generic: L4
                    - generic [ref=e260]:
                      - generic [ref=e261]: Logic Location
                      - generic [ref=e262]: Verdict returned to user.
                  - generic [ref=e263]:
                    - generic [ref=e265]:
                      - generic [ref=e266]: Confidence
                      - generic [ref=e267]: 85%
                    - generic [ref=e271]:
                      - generic [ref=e272]: Credits Used
                      - generic [ref=e273]: "3"
      - contentinfo [ref=e275]:
        - generic [ref=e277]:
          - generic [ref=e278]:
            - img "Litigant AI" [ref=e279]
            - generic [ref=e280]: LITIGANT-AI
            - generic [ref=e281]: © 2026
          - paragraph [ref=e282]: AI outputs are not legal, financial, or medical advice. Use judgment.
          - generic [ref=e283]:
            - link "Docs" [ref=e284] [cursor=pointer]:
              - /url: "#"
            - link "Status" [ref=e285] [cursor=pointer]:
              - /url: "#"
            - link "Privacy" [ref=e286] [cursor=pointer]:
              - /url: /privacy
            - link "Terms" [ref=e287] [cursor=pointer]:
              - /url: /terms
    - region "Notifications alt+T":
      - list:
        - listitem [ref=e288]:
          - img [ref=e290]
          - generic [ref=e293]: PDF downloaded.
  - generic [ref=e294]:
    - generic [ref=e295]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e296] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e297] [cursor=pointer]:
      - img [ref=e298]
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
> 58 |     expect(download.suggestedFilename()).toMatch(/brain-session-\d+\.pdf/);
     |                                          ^ Error: expect(received).toMatch(expected)
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