import {test, expect} from "@playwright/test";

test("open registration refreshes public settings and preserves unsaved input", async ({page}) => {
  let bonus = 123, fail = false;
  await page.route("**/api-server/api/**", async route => {
    if (route.request().url().endsWith("/billing/defaults")) {
      await route.fulfill({status:fail ? 503 : 200,json:fail ? {error:"offline"} : {signupBonusCredits:bonus}});
    } else await route.fulfill({json:{}});
  });
  await page.clock.install();
  await page.goto("/register");
  await expect(page.getByText("123 free credits on signup",{exact:true})).toBeVisible();
  const name = page.getByPlaceholder("First name, nickname, whatever you prefer");
  await name.fill("Keep this draft");
  bonus = 456;
  await page.clock.fastForward(31000);
  await expect(page.getByText("456 free credits on signup",{exact:true})).toBeVisible();
  await expect(name).toHaveValue("Keep this draft");
  fail = true;
  await page.clock.fastForward(31000);
  await expect(page.getByText("456 free credits on signup",{exact:true})).toBeVisible();
  await expect(name).toHaveValue("Keep this draft");
  fail = false; bonus = 789;
  await page.clock.fastForward(31000);
  await expect(page.getByText("789 free credits on signup",{exact:true})).toBeVisible();
});
