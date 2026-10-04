import { test, expect } from "@playwright/test";

// Isolated mobile fixture: no real account tokens, payments or AI calls.
test("mobile court controls are readable, accessible and fit the screen", async ({page}) => {
  await page.setViewportSize({width:384, height:854});
  await page.route("**/api-server/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith("/providers")) json = {providers: [], configured:[]};
    if (path.endsWith("/templates")) json = [];
    if (path.endsWith("/session-estimate")) json = {estimatedCredits:12, maxCredits:500, config: route.request().postDataJSON().config};
    await route.fulfill({json});
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/session?e2e=1");
  await page.getByRole("button", {name:/Your Court/}).click();
  for (const name of ["Add litigant", "Remove litigant"]) {
    const button = page.getByRole("button", {name, exact:true});
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", {name:/Configure court/}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("12 Credits", {exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
