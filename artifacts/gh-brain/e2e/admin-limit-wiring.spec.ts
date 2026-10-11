import {test,expect} from "./fixtures";

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
    if(path.endsWith("/admin/billing-defaults"))return route.fulfill({json:{autoRefillAmounts:[10,20],defaultAutoRefillAmount:20,defaultThresholdCredits:100,defaultWarningThresholdCredits:200,signupBonusCredits:500,emailCreditWarningThreshold:100}});
    return route.fallback();
  });
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
  await page.getByRole("button",{name:/Configure court/}).click();
  const selector=page.getByRole("combobox",{name:"Litigants",exact:true});
  await expect(selector).toContainText("2");
  await selector.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option",{name:"2",exact:true}).click();
  await page.clock.install();
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

test("legacy above-engine settings remain visible with an explicit effective-limit warning",async({page})=>{
  await page.route("**/api-server/api/limits",route=>route.fulfill({json:{limits:{maxLitigants:10,overdraftLimit:25},storedLimits:{maxLitigants:20,overdraftLimit:25},notices:["Saved maximum litigants is 20; this engine supports 10. Sessions use 10 until you save a supported limit. The saved value has not been changed."]}}));
  await page.goto("/admin?tab=limits&e2e=1");
  await expect(page.getByRole("spinbutton",{name:"Maximum litigants",exact:true})).toHaveValue("20");
  await expect(page.getByRole("alert").filter({hasText:"saved value has not been changed"})).toBeVisible();
});
