import {test,expect} from "./fixtures";

// Limits renders billing defaults alongside the limit controls in both scenarios.
test.beforeEach(async ({page}) => {
  await page.route("**/api-server/api/admin/billing-defaults", route => route.fulfill({json:{
    autoRefillAmounts:[10,20],defaultAutoRefillAmount:20,defaultThresholdCredits:100,
    defaultWarningThresholdCredits:200,signupBonusCredits:500,emailCreditWarningThreshold:100,
  }}));
});

test("saved admin limits reload, bound session options, and refresh an open configuration",async({page})=>{
  let maximum=10;
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api-server/api/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("/admin/limits/maxLitigants")) {
      maximum=route.request().postDataJSON().value;
      return route.fulfill({json:{success:true,name:"maxLitigants",value:maximum}});
    }
    if(path.endsWith("/limits"))return route.fulfill({json:{limits:{maxLitigants:maximum,overdraftLimit:25}}});
    return route.fallback();
  });
  await page.clock.install();
  await page.goto("/admin?tab=limits&e2e=1");
  const input=page.getByRole("spinbutton",{name:"Maximum litigants",exact:true});
  await expect(input).toHaveValue("10");
  await expect(input).toHaveAttribute("max","10");
  await input.fill("2");
  await page.getByRole("article",{name:"Maximum litigants",exact:true}).getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.getByText("Maximum litigants saved.",{exact:true})).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue("2");
  await page.goto("/session?e2e=1");
  await page.getByRole("button",{name:"⚙ Configure",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Configuration",exact:true})).toBeVisible();
  const selector=page.getByRole("combobox",{name:"Litigants",exact:true});
  await expect(selector).toContainText("2");
  await selector.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option",{name:"2",exact:true}).click();
  maximum=7;
  await page.clock.fastForward(31000);
  await selector.click();
  await expect(page.getByRole("option")).toHaveCount(7);
  await page.getByRole("option",{name:"7",exact:true}).click();
  await expect(selector).toContainText("7");
  maximum=2;
  await page.clock.fastForward(31000);
  await expect(selector).toContainText("2");
  expect(errors).toEqual([]);
});

test("unavailable saved limits show a retry instead of a substituted value",async({page})=>{
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  let repaired=false;
  await page.route("**/api-server/api/limits",route=>repaired
    ? route.fulfill({json:{limits:{maxLitigants:10,overdraftLimit:25}}})
    : route.fulfill({status:503,json:{error:"Platform limits are temporarily unavailable. Please try again."}}));
  await page.goto("/admin?tab=limits&e2e=1");
  const failure=page.getByRole("alert").filter({hasText:"Could not load limits."});
  await expect(failure).toBeVisible({timeout:15000});
  await expect(page.getByRole("spinbutton",{name:"Maximum litigants",exact:true})).toHaveCount(0);
  repaired=true;
  await failure.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(page.getByRole("spinbutton",{name:"Maximum litigants",exact:true})).toHaveValue("10");
  await expect(failure).toHaveCount(0);
  expect(errors).toEqual([]);
});
