import { test, expect } from "@playwright/test";

// All API and external requests are intercepted. These are public-page UI
// regressions, not live signup, email-delivery, or OAuth tests.
test.beforeEach(async ({ context, baseURL }) => {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) return route.abort();
    if (url.pathname.startsWith("/api-server/api/")) {
      const json = url.pathname.endsWith("/billing/defaults") ? { signupBonusCredits: 500 } : {};
      return route.fulfill({ json });
    }
    return route.continue();
  });
});

for (const width of [320, 390, 1280]) {
  test(`signup legal links preserve the form and are readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/register?next=%2Fbilling%3Fpack%3Dstarter");
    await page.getByLabel("Your name").fill("Test only");
    const terms = page.getByRole("link", { name: "Terms of Service (opens in a new tab)" });
    const privacy = page.getByRole("link", { name: "Privacy Policy (opens in a new tab)" });
    await expect(terms).toHaveAttribute("href", "/terms");
    await expect(privacy).toHaveAttribute("href", "/privacy");
    for (const [link, heading] of [[terms, "Terms of Service"], [privacy, "Privacy Policy"]] as const) {
      await link.focus();
      await expect(link).toBeFocused();
      const popupPromise = page.waitForEvent("popup");
      await link.press("Enter");
      const popup = await popupPromise;
      await expect(popup.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await popup.close();
      await expect(page.getByLabel("Your name")).toHaveValue("Test only");
    }
    await expect(page.getByRole("combobox", { name: "How will you use Litigant AI? (optional)" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`signed-out verification preserves safe navigation and history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const destination = "/billing?pack=starter#credit-packs";
    await page.goto(`/verify-email?next=${encodeURIComponent(destination)}`);
    await expect(page.getByRole("heading", { name: "Sign in to verify your email" })).toBeVisible();
    await expect(page.getByText("Unknown Operator")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /resend|verified/i })).toHaveCount(0);
    const signIn = page.getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(destination)}`);
    await signIn.focus();
    await expect(signIn).toBeFocused();
    await signIn.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(destination)}$`));
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Sign in to verify your email" })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", {exact: true})).toHaveAttribute("type", "password");
    await expect(page.getByRole("link", {name: "Forgot password?"})).toBeVisible();
    await page.goto("/verify-email?next=%2F%5Cevil.example");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in?next=%2Fsession");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
