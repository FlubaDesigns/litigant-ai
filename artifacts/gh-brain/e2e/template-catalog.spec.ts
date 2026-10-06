import { test, expect } from "./fixtures";
import { TEMPLATES } from "../../../lib/api-zod/src/templates";

for (const width of [360, 768, 1440]) {
  test(`public templates use saved configuration and preserve old links at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 915});
    const template = {...TEMPLATES[0], title: "Owner's business plan", description: "The current saved description",
      inputFields: [{id: "goal", label: "Owner's saved question", placeholder: "Describe your goal", type: "text", required: true}],
      defaultConfig: {...TEMPLATES[0].defaultConfig, litigantCount: 2}};
    await page.route("**/api-server/api/templates", route => route.fulfill({json: [template, ...TEMPLATES.slice(1)]}));
    await page.goto("/");
    if (width < 1024) await page.getByRole("button", {name: "Open menu", exact: true}).click();
    await page.getByRole("link", {name: "Templates", exact: true}).filter({visible:true}).click();
    await expect(page).toHaveURL(/\/templates$/);
    await expect(page.getByRole("heading", {level: 2})).toContainText([template.title]);
    await page.getByRole("textbox", {name: "Search templates"}).fill(template.title);
    await expect(page.locator(".layout__auto > div")).toHaveCount(1);
    await page.getByRole("link").filter({has: page.getByRole("heading", {name: template.title, exact: true})}).click();
    await expect(page).toHaveURL(/\/templates\/business-plan-analyzer$/);
    await expect(page.getByRole("heading", {level: 1})).toHaveText(template.title);
    await expect(page.getByText(template.description, {exact:true})).toBeVisible();
    await expect(page.getByRole("heading", {name: /Owner's saved question/})).toBeVisible();
    await expect(page.getByText(/2 litigants ·/)).toBeVisible();
    await expect(page.getByText("Business · Paid credits required", {exact:true})).toBeVisible();
    await expect(page.getByText(/Any paid credit purchase unlocks all features/).first()).toBeVisible();
    await expect(page.getByRole("link", {name: "Unlock all features", exact:true}).first()).toHaveAttribute("href", "/register?next=%2Fbilling");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.goto("/tools/business-plan-analyzer");
    await expect(page).toHaveURL(/\/templates\/business-plan-analyzer$/);
    await expect(page.getByRole("heading", {level:1})).toHaveText(template.title);
    await page.goto("/session?templateId=business-plan&e2e=1");
    await expect(page.getByLabel("Owner's saved question")).toBeVisible();
  });
}

test("inactive pages stay unavailable and custom templates get a page", async ({page}) => {
  const custom = {...TEMPLATES[0], id:"custom-case", title:"Custom case"};
  await page.route("**/api-server/api/templates", route => route.fulfill({json:[custom]}));
  await page.goto("/templates/business-plan-analyzer");
  await expect(page.getByRole("heading", {name:"Page not found"})).toBeVisible();
  await page.goto("/templates/custom-case");
  await expect(page.getByRole("heading", {level:1})).toHaveText("Custom case");
  await expect(page.getByRole("link", {name:"Unlock all features", exact:true}).first()).toHaveAttribute("href", "/register?next=%2Fbilling");
});
