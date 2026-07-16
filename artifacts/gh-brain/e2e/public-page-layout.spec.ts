import { test, expect } from "@playwright/test";

/**
 * Layout regression tests for public pages after .main-inner wrapper removal.
 *
 * These tests confirm that Landing, ToolsIndex, ToolPage, Terms, PrivacyPolicy,
 * and ShareReport all render without layout breaks, double-gutters, or missing
 * structural elements after the .main-inner wrapper was removed from every
 * non-admin public page.
 *
 * Each test checks:
 * 1. Page loads without console errors
 * 2. The SiteHeader (sticky <header>) is visible
 * 3. The page-specific hero/title content is visible
 * 4. .main container is present and .main-inner is NOT present (the removed
 *    wrapper must stay gone)
 */

test.describe("Public page layout — .main-inner removal regression", () => {

  test("Landing — hero, nav, and footer render correctly", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // SiteHeader <header> is visible (use first() — nav is a sibling inside header)
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });

    // Hero headline is visible
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });

    // .main-inner must NOT be present
    await expect(page.locator(".main-inner")).toHaveCount(0);

    // A <main> element must be present (Landing uses plain <main> with no extra class)
    await expect(page.locator("main")).toHaveCount(1);

    // No JS errors
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("Landing — pricing section and CTA render correctly", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Scroll to pricing
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));

    // Pricing section heading
    await expect(page.locator("text=Open a Case")).toBeVisible({ timeout: 10_000 });
  });

  test("ToolsIndex — hero, category filters, and tool grid render correctly", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/tools", { waitUntil: "domcontentloaded" });

    // SiteHeader is visible
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });

    // Hero heading
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("Put Your Toughest Questions");

    // Category filters present
    await expect(page.locator("text=All tools")).toBeVisible({ timeout: 5_000 });

    // At least one tool card renders
    await expect(page.locator(".layout__auto > div").first()).toBeVisible({ timeout: 10_000 });

    // .main-inner must NOT be present
    await expect(page.locator(".main-inner")).toHaveCount(0);
    await expect(page.locator("main.main")).toHaveCount(1);

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("ToolPage — hero, image, and sections render correctly", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/tools/business-plan-analyzer", { waitUntil: "domcontentloaded" });

    // SiteHeader is visible
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });

    // Hero heading
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });

    // CTA buttons (two "Ask AI a question" buttons exist on this page — top + bottom CTA)
    await expect(page.locator("text=Ask AI a question").first()).toBeVisible({ timeout: 5_000 });

    // How it works section heading (use heading role to avoid matching the nav link)
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible({ timeout: 5_000 });

    // .main-inner must NOT be present
    await expect(page.locator(".main-inner")).toHaveCount(0);
    await expect(page.locator("main.main")).toHaveCount(1);

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("Terms — title, disclaimer box, and content sections render correctly", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/terms", { waitUntil: "domcontentloaded" });

    // SiteHeader is visible
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });

    // Page title
    await expect(page.locator("h1")).toContainText("Terms of Service");

    // Disclaimer box
    await expect(page.locator("text=Entertainment Purposes Only").first()).toBeVisible({ timeout: 5_000 });

    // Back to home link
    await expect(page.locator("text=Back to home")).toBeVisible({ timeout: 5_000 });

    // First numbered section
    await expect(page.locator("text=1. The Service")).toBeVisible({ timeout: 5_000 });

    // .main-inner must NOT be present
    await expect(page.locator(".main-inner")).toHaveCount(0);
    await expect(page.locator("main.main")).toHaveCount(1);

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("PrivacyPolicy — title, disclaimer box, and content sections render correctly", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/privacy", { waitUntil: "domcontentloaded" });

    // SiteHeader is visible
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });

    // Page title
    await expect(page.locator("h1")).toContainText("Privacy Policy");

    // Disclaimer box
    await expect(page.locator("text=Entertainment Purposes Only").first()).toBeVisible({ timeout: 5_000 });

    // Back to home link
    await expect(page.locator("text=Back to home")).toBeVisible({ timeout: 5_000 });

    // First numbered section
    await expect(page.locator("text=1. Who We Are")).toBeVisible({ timeout: 5_000 });

    // .main-inner must NOT be present
    await expect(page.locator(".main-inner")).toHaveCount(0);
    await expect(page.locator("main.main")).toHaveCount(1);

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("ShareReport — not-found state renders correctly without layout shift", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Use a fake shareId — the page should show "Report not found" gracefully
    await page.goto("/report/layout-test-nonexistent-id", { waitUntil: "domcontentloaded" });

    // The "report not found" fallback state (shown after fetch resolves with 404)
    await expect(page.locator("text=Report not found")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Try Litigant AI")).toBeVisible({ timeout: 5_000 });

    // .main-inner must NOT be present anywhere on this page
    await expect(page.locator(".main-inner")).toHaveCount(0);

    // Note: the not-found fallback renders a plain <div>, not <main>; that is intentional.
    // We just confirm the key layout content is visible and no double-wrapper is present.

    expect(errors.filter((e) => !e.includes("favicon") && !e.includes("Failed to load resource"))).toEqual([]);
  });

});
