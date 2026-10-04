import {test, expect} from "@playwright/test";

test("pack session counts use the live court quote and checkout credit amounts", async ({page}) => {
  let cost = 93, failQuote = false, starterCredits = 500;
  const seenConfigs: any[] = [];
  await page.route("**/api-server/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session-estimate")) {
      const config = route.request().postDataJSON().config;
      seenConfigs.push(config);
      return route.fulfill({status:failQuote ? 503 : 200, json:failQuote ? {message:"Unavailable"} : {estimatedCredits:cost,maxCredits:100000,config}});
    }
    let json: any = {};
    if (path.endsWith("/billing/defaults")) json = {signupBonusCredits:100};
    if (path.endsWith("/providers")) json = {providers:[
      {name:"openai",displayName:"OpenAI",defaultModel:"gpt-5",models:[{id:"gpt-5",label:"GPT-5"}]},
      {name:"anthropic",displayName:"Anthropic",defaultModel:"claude-opus-4-5",models:[{id:"claude-opus-4-5",label:"Claude Opus 4.5"}]},
    ]};
    if (path.endsWith("/billing/products")) json = {data:[
      {id:"starter",name:"Starter",active:true,metadata:{type:"credit_pack",creditAmount:"9999"},prices:[{active:true,recurring:null,unit_amount:699,currency:"usd",metadata:{creditAmount:String(starterCredits)}}]},
      {id:"pro",name:"Pro",active:true,metadata:{type:"credit_pack",creditAmount:"2200"},prices:[{active:true,recurring:null,unit_amount:1999,currency:"usd",metadata:{creditAmount:"2200"}}]},
    ]};
    return route.fulfill({json});
  });
  await page.clock.install();
  await page.goto("/");
  const starter = page.getByTestId("pricing-starter"), pro = page.getByTestId("pricing-pro");
  await expect(starter).toContainText("$6.99");
  await expect(starter).toContainText("500 credits");
  await expect(starter).toContainText("About 5 sessions at these settings");
  await expect(pro).toContainText("About 23 sessions at these settings");
  expect(seenConfigs.at(-1)).toMatchObject({provider:"openai",model:"gpt-5",litigantCount:3,maxIterations:2,responseMode:"balanced"});
  cost = 278;
  await page.getByLabel("Model for session estimate").selectOption("claude-opus-4-5");
  await page.clock.fastForward(400);
  await expect(starter).toContainText("About 1 session at these settings");
  await expect(pro).toContainText("About 7 sessions at these settings");
  await expect(page.getByTestId("pricing-trial")).toContainText("Below the estimated cost of one session");
  expect(seenConfigs.at(-1)).toMatchObject({provider:"anthropic",model:"claude-opus-4-5"});
  starterCredits = 1000;
  await page.clock.fastForward(31000);
  await expect(starter).toContainText("About 3 sessions at these settings");
  failQuote = true;
  await page.clock.fastForward(31000);
  await page.clock.fastForward(2000);
  await expect(starter.getByTestId("session-count")).toHaveText("Session estimate unavailable");
  await expect(page.getByText(/12–33|55–146|105–280/)).toHaveCount(0);
});
