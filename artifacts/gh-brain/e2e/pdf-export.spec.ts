import { test, expect } from "@playwright/test";

/**
 * PDF export end-to-end tests.
 *
 * These tests use two dev-only hooks that were added alongside this test file:
 *
 * 1. ?e2e=1 URL param  — ProtectedRoute skips Firebase auth checks in DEV mode
 *    so we can access /session without signing in.
 *
 * 2. window.__testPdfExport(finalAnswer) — registered by SessionPage's useEffect
 *    (DEV only). Injects a completed session state (phase="complete",
 *    config.format="pdf") with the supplied finalAnswer, making the output panel
 *    and PDF download button visible without running a real AI session.
 */

const SESSION_URL = "/session?e2e=1";

async function loadSessionPage(page: import("@playwright/test").Page) {
  await page.goto(SESSION_URL, { waitUntil: "domcontentloaded" });
  // Wait for React to mount and the dev hook to register
  await page.waitForFunction(
    () => typeof (window as any).__testPdfExport === "function",
    { timeout: 15_000 }
  );
}

async function injectCompletedSession(
  page: import("@playwright/test").Page,
  finalAnswer: string
) {
  await page.evaluate((fa) => {
    (window as any).__testPdfExport(fa);
  }, finalAnswer);

  // Wait for the output panel to appear (phase transitions to "complete")
  await page.waitForSelector('button:has-text("PDF")', { timeout: 10_000 });
}

test.describe("PDF export — trim guard", () => {
  test("short content: PDF downloads and only success toast fires", async ({
    page,
  }) => {
    await loadSessionPage(page);

    const shortAnswer = "The court finds in favour of the claimant.";
    await injectCompletedSession(page, shortAnswer);

    // Start watching for a download triggered by jsPDF's doc.save()
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });

    // Click the "PDF" download button (not the "Print" button)
    // It is the button whose exact text is "PDF" — Print comes right after it
    await page.locator('button', { hasText: /^PDF$/ }).click();

    // The download must succeed
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/brain-session-\d+\.pdf/);

    // Success toast must appear
    await expect(page.locator("text=PDF downloaded")).toBeVisible({
      timeout: 5_000,
    });

    // Warning toast must NOT appear
    const warningToast = page.locator("text=trimmed");
    await expect(warningToast).not.toBeVisible();
  });

  test("long content (>15 000 chars): PDF downloads AND trim warning toast fires", async ({
    page,
  }) => {
    await loadSessionPage(page);

    // 20 000 chars — well over the 15 000 char limit
    const longAnswer = "A".repeat(20_000);
    await injectCompletedSession(page, longAnswer);

    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });

    await page.locator('button', { hasText: /^PDF$/ }).click();

    // The download must succeed even for trimmed content
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/brain-session-\d+\.pdf/);

    // Success toast must appear
    await expect(page.locator("text=PDF downloaded")).toBeVisible({
      timeout: 5_000,
    });

    // Warning toast must ALSO appear
    await expect(page.locator("text=trimmed")).toBeVisible({
      timeout: 5_000,
    });
  });
});
