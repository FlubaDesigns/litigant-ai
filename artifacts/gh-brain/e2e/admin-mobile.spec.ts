import {test, expect} from "./fixtures";

const longId = "a-long-existing-record-identifier-that-must-wrap-on-a-phone";
const model = {id:"gpt-5",model:"gpt-5",label:"GPT model with a long descriptive name",provider:"openai",providerLabel:"OpenAI",inputRatePer1k:0.001,outputRatePer1k:0.002,userInputPer1k:0.002,userOutputPer1k:0.004,multiplier:2,exampleCredits:12,qualityScore:80,enabled:true,available:true};
const studioProvider = {id:"openai",label:"OpenAI",custom:false,enabled:true,connection:{state:"connected",checkedAt:"2026-10-05T02:00:00Z"}};
const email = {id:"welcome",label:"Welcome email",trigger:longId,tokens:[],canDisable:true,enabled:true,defaultSubject:"Welcome",defaultHeadline:"Welcome",defaultIntroText:"Hello"};
const responses: Record<string,unknown> = {
  "/admin/stats":{userCount:9,sessionCount:12,txCount:9,recentSessions:0},
  "/admin/checklist":{items:[{id:"owner-item",section:"owner",text:"Review the provider configuration on your phone",checked:false,steps:["Open API Keys"]}]},
  "/admin/system-health":{status:"ok",collections:{credit_transactions:9},last24h:{newSessions:0},last7d:{errorSessions:1,feedbackEntries:2,activeSessions:100,errorRate:"1.0"}},
  "/admin/ai-studio/models":{providers:[studioProvider],models:[model],disabledProviders:[],customProviders:[]},
  "/admin/seat-briefs":{seatIds:["orchestrator"],active:{orchestrator:"Coordinate the discussion."},overrides:{}},
  "/admin/pricing":{creditValueUsd:0.01,models:[model]},
  "/admin/api-keys":{providers:[{id:"openai",label:"OpenAI",maskedKey:"••••hidden",source:"env",baseUrl:"https://api.example.test/very/long/provider/address"}]},
  "/admin/users":{users:[{id:longId,email:"long-address-for-mobile-layout@example.test",displayName:"Layout fixture",creditBalance:5500}],hasMore:false},
  "/admin/sessions":{sessions:[{id:longId,title:"A session question that should remain readable on a narrow phone",userId:longId,status:"complete",confidence:0,creditsUsed:0,createdAt:"2026-07-17T12:00:00Z"}],hasMore:false},
  [`/admin/sessions/${longId}`]:{session:{id:longId,title:"A session question that should remain readable on a narrow phone",userId:longId,status:"complete",confidence:0,creditsUsed:0},turns:[]},
  "/admin/transactions":{transactions:[{id:longId,userId:longId,type:"usage",amount:-50,balanceAfter:0,source:"session",createdAt:"2026-07-17T12:00:00Z"}],hasMore:false},
  "/admin/api-usage":{totalSessions:5,totalCreditsUsed:100,byDay:[{date:"2026-10-04",sessions:5,creditsUsed:100}],apiLogs:[{id:longId,model:longId,status:"error",durationMs:300}]},
  "/admin/error-logs":{logs:[{id:longId,message:longId,userId:longId}],failedSessions:[]},
  "/admin/abuse-flags":{flags:[{id:longId,rating:"bad",reason:longId,userId:longId,sessionId:longId}],totalCount:1},
  "/admin/credit-packs":{packs:[{id:"fixture",name:"Example pack",description:"A test fixture only",active:true,metadata:{creditAmount:"500"},prices:[{id:"price",unit_amount:500,currency:"usd"}]},{id:"inactive",name:"Inactive pack",active:false,metadata:{creditAmount:"500"},prices:[]}],bounds:{}},
  "/limits":{limits:{maxLitigants:10}},
  "/feature-flags":{flags:{creditOverdraft:true}},
  "/admin/templates":{templates:[]},
  "/admin/email-templates":{templates:[email]},
  "/admin/email-templates/welcome/versions":{versions:[]},
  "/admin/billing-defaults":{autoRefillAmounts:[10,20,50],defaultAutoRefillAmount:20,defaultThresholdCredits:100,defaultWarningThresholdCredits:200,signupBonusCredits:500,emailCreditWarningThreshold:100},
};

test.beforeEach(async ({page}) => {
  await page.route("**/api-server/api/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api-server/api", "");
    if (path === "/admin/transactions" && new URL(route.request().url()).searchParams.has("type")) {
      await route.fulfill({json:{transactions:[],hasMore:false}});
      return;
    }
    if (Object.hasOwn(responses,path)) await route.fulfill({json:responses[path]});
    else await route.fallback();
  });
});

for (const width of [360, 412]) {
  test(`all admin pages fit ${width}px and tables stack with their column labels`, async ({page}) => {
    test.setTimeout(90000);
    await page.setViewportSize({width,height:800});
    const errors:string[]=[];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/admin?e2e=1");
    const navigation=page.getByRole("navigation",{name:"Admin navigation"});
    await expect(navigation).toBeVisible();
    const tabs=await navigation.locator("button").evaluateAll(buttons=>buttons.map(button=>({id:button.getAttribute("data-admin-tab")!,label:button.textContent!})));
    expect(tabs).toHaveLength(18);
    for (const tab of tabs) {
      await navigation.getByRole("button",{name:tab.label,exact:true}).click();
      await expect(page.locator(".admin-page h1")).toHaveText(tab.label);
      await expect(page.locator(".admin-page .animate-pulse")).toHaveCount(0);
      await expect.poll(()=>page.locator(".admin-page").evaluate(el=>el.scrollWidth<=el.clientWidth+1),{message:tab.label}).toBe(true);
      const overflow=await page.locator(".admin-page").evaluate(root=>Array.from(root.querySelectorAll("p, input, select, tbody td, button")).filter(el=>{
        if (el.closest(".admin-mobile-nav")) return false;
        const rect=el.getBoundingClientRect();
        return rect.width>0 && (rect.left< -1 || rect.right>window.innerWidth+1);
      }).map(el=>el.textContent?.slice(0,60)));
      expect(overflow,tab.label).toEqual([]);
      if (tab.id === "users") {
        const card=page.getByRole("article",{name:"User Layout fixture"});
        const rows=card.locator("dl .layout--keep-columns");
        await expect(rows).toHaveCount(2);
        for (const row of await rows.all()) {
          const [left,right]=await row.locator(":scope > div").evaluateAll(cells=>cells.map(cell=>{
            const {x,y,width}=cell.getBoundingClientRect();return {x,y,width};
          }));
          expect(Math.abs(left!.y-right!.y)).toBeLessThan(1);
          expect(Math.abs(left!.width-right!.width)).toBeLessThan(1);
        }
        expect((await card.boundingBox())!.height).toBeLessThan(270);
        await card.getByRole("button",{name:"Actions for Layout fixture"}).click();
        await page.getByRole("menuitem",{name:"Adjust credits"}).click();
        await expect(page.getByRole("dialog",{name:"Adjust Credits"})).toBeVisible();
        await page.getByRole("button",{name:"Cancel",exact:true}).click();
      }
      if (tab.id === "sessions") {
        const card=page.getByRole("article",{name:"Session A session question that should remain readable on a narrow phone"});
        const rows=card.locator("dl .layout--keep-columns");
        await expect(rows).toHaveCount(2);
        for (const row of await rows.all()) {
          const [left,right]=await row.locator(":scope > div").evaluateAll(cells=>cells.map(cell=>{
            const {x,y,width}=cell.getBoundingClientRect();return {x,y,width};
          }));
          expect(Math.abs(left!.y-right!.y)).toBeLessThan(1);
          expect(Math.abs(left!.width-right!.width)).toBeLessThan(1);
        }
        expect((await card.boundingBox())!.height).toBeLessThan(270);
        await expect(card.getByText("0%",{exact:true})).toBeVisible();
        await expect(card.getByText("0",{exact:true})).toBeVisible();
        await expect(card).not.toContainText(longId);
        await card.getByRole("button",{name:/Open session:/}).click();
        const detail=page.getByRole("dialog",{name:"Session Detail"});
        await expect(detail).toBeVisible();
        await expect(detail.getByText(longId,{exact:true})).toBeVisible();
        await expect(detail.getByText("0%",{exact:true})).toBeVisible();
        await detail.getByRole("button",{name:"Close",exact:true}).click();
      }
      if (tab.id === "transactions") {
        const card=page.getByRole("article",{name:"Transaction usage",exact:true});
        const rows=card.locator("dl .layout--keep-columns");
        await expect(rows).toHaveCount(2);
        for (const row of await rows.all()) {
          const [left,right]=await row.locator(":scope > div").evaluateAll(cells=>cells.map(cell=>{
            const {x,y,width}=cell.getBoundingClientRect();return {x,y,width};
          }));
          expect(Math.abs(left!.y-right!.y)).toBeLessThan(1);
          expect(Math.abs(left!.width-right!.width)).toBeLessThan(1);
        }
        expect((await card.boundingBox())!.height).toBeLessThan(300);
        await expect(card.getByText("-50",{exact:true})).toBeVisible();
        await expect(card.getByText("0",{exact:true})).toBeVisible();
        await expect(card.getByText(longId,{exact:true}).first()).toBeHidden();
        await card.locator("summary").click();
        await expect(card.getByText(longId,{exact:true}).first()).toBeVisible();
        await expect.poll(()=>page.locator(".admin-page").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
        await card.locator("summary").click();
        const refund=card.getByRole("button",{name:"Refund",exact:true});
        expect(Math.round((await refund.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
        await refund.click();
        const dialog=page.getByRole("dialog",{name:"Issue Refund"});
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("spinbutton")).toHaveValue("50");
        await expect(dialog.getByText(longId,{exact:true})).toBeVisible();
        await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
      }
      if (tab.id === "overview" || tab.id === "health") {
        const rows=page.locator(".admin-page .row.layout__split-2");
        await expect(rows).toHaveCount(tab.id === "health" ? 4 : 2);
        for (const row of await rows.all()) {
          const cards=await row.locator(".lgt-card").all();
          expect(cards).toHaveLength(2);
          const [left,right]=await row.locator(".lgt-card").evaluateAll(cells=>cells.map(cell=>{
            const {x,y,width}=cell.getBoundingClientRect();return {x,y,width};
          }));
          expect(Math.abs(left!.y-right!.y)).toBeLessThan(1);
          expect(Math.abs(left!.width-right!.width)).toBeLessThan(1);
          expect(right!.x).toBeGreaterThan(left!.x);
        }
        await expect(page.getByText("System Notes",{exact:true})).toHaveCount(0);
      }
      for (const table of await page.locator("table[data-mobile-cards]").all()) {
        await expect(table).toHaveCSS("display","block");
        for (const label of await table.locator(".mobile-table-label").all()) {
          await expect(label).toBeVisible();
          await expect(label).not.toHaveText("");
        }
      }
    }
    expect(errors).toEqual([]);
    await page.getByRole("button",{name:"Edit",exact:true}).click();
    const panel=page.getByRole("dialog");
    await expect(panel).toBeVisible();
    const bounds=await panel.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    await expect(panel.getByRole("button",{name:"Save changes",exact:true})).toBeVisible();
    await panel.getByRole("button",{name:"Close",exact:true}).click();
  });
}

test("API key cards open the editor immediately on desktop and mobile", async ({page}) => {
  for (const width of [1280,360]) {
    await page.setViewportSize({width,height:800});
    await page.goto("/admin?tab=api-keys&e2e=1");
    const edit=page.getByRole("button",{name:"Replace OpenAI API key"});
    await edit.click();
    const panel=page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel("New API key")).toBeVisible();
    await expect(panel.getByRole("button",{name:"Save Key",exact:true})).toBeDisabled();
    await expect.poll(async () => (await panel.getByRole("button",{name:"Save Key",exact:true}).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(width===360 ? 44 : 36);
    await panel.getByRole("button",{name:"Cancel",exact:true}).click();
  }
});

test("checklist shows outstanding and recurring tasks and keeps completion after reload", async ({page}) => {
  await page.setViewportSize({width:360,height:800});
  const items = [
    {id:"finished",section:"owner",text:"Completed setup",checked:true},
    {id:"pending",section:"owner",text:"Remaining setup",checked:false,note:"Long explanation"},
    {id:"recurring",section:"agent",text:"Repeat review",checked:true,recurring:true},
  ];
  await page.route("**/api-server/api/admin/checklist**", async route => {
    if (route.request().method() === "PATCH") {
      const id = new URL(route.request().url()).pathname.split("/").pop();
      items.find(item => item.id === id)!.checked = route.request().postDataJSON().checked;
      await route.fulfill({json:{ok:true}});
    } else await route.fulfill({json:{items}});
  });
  await page.goto("/admin?tab=checklist&e2e=1");
  await expect(page.getByText("Launch readiness checklist.")).toHaveCount(0);
  await expect(page.getByText("Completed setup",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Long explanation",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("checkbox",{name:"Repeat review"})).toBeChecked();
  await page.getByRole("checkbox",{name:"Remaining setup"}).click();
  await expect(page.getByText("Your action items",{exact:true})).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("checkbox",{name:"Repeat review"})).toBeChecked();
  await expect(page.getByText("Remaining setup",{exact:true})).toHaveCount(0);
  await page.getByRole("checkbox",{name:"Repeat review"}).click();
  await expect(page.getByRole("checkbox",{name:"Repeat review"})).not.toBeChecked();
});

test("checklist restores a task when saving fails and hides empty completed sections", async ({page}) => {
  let finished = false;
  await page.route("**/api-server/api/admin/checklist**", async route => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({status:500,json:{error:"Save failed"}});
    } else await route.fulfill({json:{items:[{id:"pending",section:"owner",text:"Remaining setup",checked:finished}]}});
  });
  await page.goto("/admin?tab=checklist&e2e=1");
  await page.getByRole("checkbox",{name:"Remaining setup"}).click();
  await expect(page.getByText("Failed to update checklist item")).toBeVisible();
  await expect(page.getByRole("checkbox",{name:"Remaining setup"})).not.toBeChecked();
  finished = true;
  await page.reload();
  await expect(page.getByText("Nothing left to do.")).toBeVisible();
  await expect(page.getByText("Your action items",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Agent work items",{exact:true})).toHaveCount(0);
});


test("health distinguishes unavailable metrics, no activity, and real zeros", async ({page}) => {
  let mode="unavailable";
  await page.setViewportSize({width:360,height:800});
  await page.route("**/api-server/api/admin/system-health",async route=>{
    if(mode==="failure") return route.fulfill({status:500,json:{error:"Unavailable"}});
    await route.fulfill({json:{status:mode==="unavailable"?"degraded":"ok",collections:{users:2,sessions:59,credit_transactions:9},last24h:{newSessions:0},last7d:{
      errorSessions:mode==="unavailable"?null:0,activeSessions:mode==="unavailable"?null:mode==="empty"?0:5,
      feedbackEntries:0,errorRate:mode==="zero"?"0.0":null,
    }}});
  });
  await page.goto("/admin?tab=health&e2e=1");
  const card=(label:string)=>page.locator(".lgt-card").filter({has:page.getByText(label,{exact:true})});
  await expect(page.getByRole("alert")).toHaveText("Error metrics unavailable.");
  await expect(card("Error rate")).toContainText("Unavailable");
  mode="empty";
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(card("Error rate")).toContainText("—");
  mode="zero";
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(card("Error rate")).toContainText("0.0%");
  mode="failure";
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveText("System health unavailable.");
  mode="zero";
  await page.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(card("Error rate")).toContainText("0.0%");
});

for (const width of [360,412]) test(`AI Studio controls and pricing fit ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:800});
  const models=[{...model,label:"GPT-5",pricing:{verifiedAt:"2026-10-05",sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5"}},
    {...model,id:"gemini-2.5-pro",label:"Gemini 2.5 Pro",provider:"gemini",providerLabel:"Google Gemini"}];
  let disabledProviders:string[]=[];
  await page.route("**/api-server/api/admin/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if (path.endsWith("/ai-studio/models")) return route.fulfill({json:{models,providers:[{...studioProvider,enabled:!disabledProviders.includes("openai")},{...studioProvider,id:"gemini",label:"Google Gemini"}],disabledProviders,customProviders:[]}});
    if (route.request().method()==="GET") return route.fallback();
    const body=route.request().postDataJSON();
    if(path.endsWith("/pricing/gpt-5")) {models[0].multiplier=body.multiplier;models[0].userInputPer1k=models[0].inputRatePer1k*body.multiplier;}
    else if(path.endsWith("/model-scores/gpt-5")) models[0].qualityScore=body.score;
    else if(path.endsWith("/ai-studio/models/gpt-5")) models[0].enabled=body.enabled;
    else if(path.endsWith("/ai-studio/providers/openai")) disabledProviders=body.enabled?[]:["openai"];
    else return route.fallback();
    return route.fulfill({json:{ok:true}});
  });
  await page.goto("/admin?tab=ai-studio&e2e=1");
  await expect(page.getByText("You control the catalog.")).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button",{name:"GPT-5",exact:true}).click();
  const table=page.locator(".studio-rates");
  await expect(table).toBeVisible();
  await expect(table).toHaveCSS("display","table");
  const iq=page.getByRole("spinbutton",{name:"GPT-5 IQ score"});
  const markup=page.getByRole("spinbutton",{name:"GPT-5 multiplier"});
  const left=await iq.boundingBox(),right=await markup.boundingBox();
  expect(Math.abs(left!.y-right!.y)).toBeLessThan(1);
  expect(Math.abs(left!.width-right!.width)).toBeLessThan(1);
  await iq.fill("91"); await iq.press("Enter");
  await expect.poll(()=>models[0].qualityScore).toBe(91);
  await expect(iq).toBeEnabled();
  await markup.fill("7"); await markup.press("Enter");
  await expect.poll(()=>models[0].multiplier).toBe(7);
  await expect(table).toContainText("$7.00");
  const toggle=page.getByRole("switch",{name:"Enable GPT-5",exact:true});
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveCSS("height","44px");
  expect(await toggle.evaluate(el=>getComputedStyle(el,"::before").height)).toBe("20px");
  await expect(toggle.locator("span")).toHaveCSS("translate","none");
  await toggle.click(); await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("switch",{name:"Enable OpenAI",exact:true})).toBeEnabled();
  await page.getByRole("switch",{name:"Enable OpenAI",exact:true}).click();
  await expect(toggle).toBeDisabled();
  await page.getByRole("button",{name:"Google Gemini",exact:true}).click();
  await expect(iq).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("switch",{name:"Enable GPT-5",exact:true})).not.toBeChecked();
  await expect.poll(()=>page.locator(".admin-page").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});


test("session details distinguish measured agent costs from legacy usage", async ({page}) => {
  await page.setViewportSize({width:360,height:800});
  await page.route(`**/api-server/api/admin/sessions/${longId}`,async route=>route.fulfill({json:{session:{id:longId,costUSD:.012,callUsage:[
    {seat:"Builder",model:"gpt-5",provider:"openai",inputTokens:1000,outputTokens:1000,costUSD:.01,usageSource:"provider",rateVerifiedAt:"2026-10-05"},
    {seat:"Auditor",model:"gpt-4o-mini",provider:"openai",inputTokens:1000,outputTokens:1000,costUSD:.002,usageSource:"estimated"},
    {model:"old-model",provider:"old",inputTokens:1000,outputTokens:1000},
  ]},turns:[]}}));
  await page.goto("/admin?tab=sessions&e2e=1");
  await page.getByText("A session question that should remain readable on a narrow phone",{exact:true}).click();
  const costs=page.getByRole("region",{name:"Agent costs"});
  await expect(costs).toContainText("$0.01000");
  await expect(costs).toContainText("Provider token counts");
  await expect(costs).toContainText("Estimated tokens");
  await expect(costs).toContainText("Unassigned (legacy)");
  await expect(costs).toContainText("Unavailable");
  await expect(costs).toContainText("Not reconciled to provider invoices.");
});


test("AI Studio checks connections on request without automatic polling",async({page})=>{
  let connected=true;
  await page.clock.install();
  await page.route("**/api-server/api/admin/ai-studio/models",async route=>route.fulfill({json:{
    providers:[{...studioProvider,connection:{state:connected?"connected":"key_rejected",checkedAt:new Date().toISOString()}}],
    models:connected?[model]:[],disabledProviders:[],customProviders:[],
  }}));
  await page.goto("/admin?tab=ai-studio&e2e=1");
  await expect(page.getByText("Connected",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:model.label,exact:true})).toBeVisible();
  connected=false;
  await page.clock.fastForward(120000);
  await expect(page.getByText("Connected",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Check connection",exact:true}).click();
  await expect(page.getByText("Key rejected",{exact:true})).toBeVisible();
  await expect(page.getByRole("switch",{name:"Enable OpenAI",exact:true})).toHaveAttribute("data-connection","unavailable");
  await expect(page.getByRole("button",{name:model.label,exact:true})).toHaveCount(0);
  await expect(page.getByText("0 verified models · 0 enabled",{exact:true})).toBeVisible();
  connected=true;
  await page.getByRole("button",{name:"Check connection",exact:true}).click();
  await expect(page.getByText("Connected",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:model.label,exact:true})).toBeVisible();
});

test("seat orders save, reload, cancel, and retain drafts on failure",async({page})=>{
  let saved="Original rules",fail=false;
  await page.route("**/api-server/api/admin/seat-briefs**",async route=>{
    if(route.request().method()==="PATCH"){
      if(fail)return route.fulfill({status:500,json:{error:"Could not save"}});
      saved=route.request().postDataJSON().text.trim();
      return route.fulfill({json:{success:true}});
    }
    return route.fulfill({json:{seatIds:["orchestrator"],active:{orchestrator:saved},defaults:{orchestrator:"Default"},overrides:{orchestrator:saved}}});
  });
  await page.goto("/admin?tab=seat-orders&e2e=1");
  await expect(page.getByRole("heading",{name:"Seat Orders",exact:true})).toHaveCount(1);
  const edit=page.getByRole("button",{name:"Edit Orchestrator",exact:true});
  await edit.click();
  const field=page.getByRole("textbox",{name:"Orchestrator instructions"});
  await field.fill("New saved rules");
  await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect(field).toHaveCount(0);
  await page.reload();
  await edit.click();
  await expect(field).toHaveValue("New saved rules");
  await field.fill("Discard this draft");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await edit.click();
  await expect(field).toHaveValue("New saved rules");
  fail=true;
  await field.fill("Keep this failed draft");
  await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.getByText("Could not save",{exact:true})).toBeVisible();
  await expect(field).toHaveValue("Keep this failed draft");
  expect(saved).toBe("New saved rules");
});

test("pricing saves, reloads, resets, and keeps a failed draft on a phone",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  let multiplier=5,fail=false,reads=0,writes=0;
  await page.route("**/api-server/api/admin/pricing**",async route=>{
    const method=route.request().method();
    if(method!=="GET"){
      writes++;
      if(fail)return route.fulfill({status:500,json:{error:"Could not save pricing"}});
      multiplier=method==="DELETE"?5:route.request().postDataJSON().multiplier;
      return route.fulfill({json:{success:true}});
    }
    reads++;
    return route.fulfill({json:{creditValueUsd:.01,models:[{...model,label:"GPT-5",providerLabel:"OpenAI",defaultMultiplier:5,effectiveMultiplier:multiplier,isOverridden:multiplier!==5,exampleCredits:multiplier*10,pricing:{sourceUrl:"https://example.test/pricing",verifiedAt:"2026-10-05",cachedInputPer1k:.0001}}]}});
  });
  await page.goto("/admin?tab=pricing&e2e=1");
  await expect(page.getByText("API Input /1M",{exact:true}).last()).toBeVisible();
  await expect(page.getByRole("link",{name:"Source",exact:true})).toHaveAttribute("href","https://example.test/pricing");
  await page.getByRole("button",{name:"Edit multiplier for gpt-5"}).click();
  const field=page.getByRole("spinbutton",{name:"GPT-5 multiplier"}),save=page.getByRole("button",{name:"Save",exact:true});
  await field.fill("");await expect(save).toBeDisabled();
  await field.press("Enter");expect(writes).toBe(0);
  await field.fill("6.5");await save.click();
  await expect(field).toHaveCount(0);
  await expect(page.getByText("6.5×",{exact:true})).toBeVisible();
  await expect(page.getByText("$0.65",{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText("6.5×",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Reset gpt-5 multiplier to default"}).click();
  await expect(page.getByText("5×",{exact:true})).toBeVisible();
  fail=true;
  await page.getByRole("button",{name:"Edit multiplier for gpt-5"}).click();
  await field.fill("9");await save.click();
  await expect(page.getByText("Could not save pricing",{exact:true})).toBeVisible();
  await expect(field).toHaveValue("9");expect(multiplier).toBe(5);
  await expect.poll(()=>page.locator(".admin-page").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  const nav=page.getByRole("navigation",{name:"Admin navigation"});
  await nav.getByRole("button",{name:"Overview",exact:true}).click();
  multiplier=8;
  await nav.getByRole("button",{name:"Pricing",exact:true}).click();
  await expect(page.getByText("8×",{exact:true})).toBeVisible();
  await page.clock.install();const before=reads;
  await page.clock.fastForward(90000);
  expect(reads).toBe(before);
});


for (const width of [360, 412]) test(`pricing explains unavailable models with compact mobile controls at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:800});
  let reads=0, connected=false;
  await page.route("**/api-server/api/admin/pricing", async route => {
    reads++;
    await route.fulfill({json:{creditValueUsd:.01,
      providers:[{...studioProvider,modelCount:connected ? 1 : 0,connection:{...studioProvider.connection,state:connected ? "connected" : "key_rejected"}}],
      models:connected ? [{...model,defaultMultiplier:5,effectiveMultiplier:5,isOverridden:false}] : [],
    }});
  });
  await page.goto("/admin?tab=pricing&e2e=1");
  await expect(page.getByText("Pricing is blocked by provider connections.")).toBeVisible();
  await expect(page.getByText("Key rejected",{exact:true})).toBeVisible();
  const details=page.locator("details").filter({has:page.locator("summary",{hasText:"How pricing works"})});
  await expect(details).not.toHaveAttribute("open", "");
  expect((await page.getByText("Pricing is blocked by provider connections.").boundingBox())!.y).toBeLessThan(500);
  await expect(page.locator(".admin-page")).toBeVisible();
  expect(await page.locator(".admin-page").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.clock.install();const before=reads;
  await page.clock.fastForward(90000);expect(reads).toBe(before);
  connected=true;
  await page.getByRole("button",{name:"Check connections",exact:true}).click();
  await expect(page.getByRole("button",{name:"Edit multiplier for gpt-5"})).toBeVisible();
  await expect(page.getByText("Pricing is blocked by provider connections.")).toHaveCount(0);
  connected=false;
  await page.getByRole("button",{name:"Check connections",exact:true}).click();
  await page.getByRole("button",{name:"API Keys",exact:true}).first().click();
  await expect(page.locator(".admin-page h1")).toHaveText("API Keys");
});


test.describe("touch API key management", () => {
  test.use({hasTouch:true, viewport:{width:360,height:800}});
  test("add, replace, retry and reload use one key form and safe provider links", async ({page}) => {
    const links = [
      ["OpenAI","https://platform.openai.com/api-keys"],
      ["Anthropic (Claude)","https://platform.claude.com/settings/keys"],
      ["xAI Grok","https://console.x.ai/team/default/api-keys"],
      ["Google Gemini","https://aistudio.google.com/apikey"],
    ];
    let keys:any[]=[{id:"openai",label:"OpenAI",maskedKey:"stored••••1111",source:"env"}], reads=0, fail=false;
    const writes:any[]=[];
    await page.route("**/api-server/api/admin/api-keys**",async route=>{
      if(route.request().method()==="GET") {reads++; return route.fulfill({json:{providers:keys}});}
      const body=route.request().postDataJSON();
      writes.push({id:new URL(route.request().url()).pathname.split("/").pop(),...body});
      if(fail)return route.fulfill({status:500,json:{error:"Unable to save key. Try again."}});
      const id=writes.at(-1).id;
      keys=[...keys.filter(k=>k.id!==id),{id,label:body.label,maskedKey:"stored••••2222",source:"firestore"}];
      return route.fulfill({json:{success:true}});
    });
    await page.goto("/admin?tab=api-keys&e2e=1");
    for(const [label,href] of links) {
      const link=page.getByRole("link",{name:`Get ${label} API key`,exact:true});
      await expect(link).toHaveAttribute("href",href);
      await expect(link).toHaveAttribute("target","_blank");
      expect(Math.round((await link.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    }
    const card=page.getByRole("region",{name:"OpenAI API key",exact:true});
    expect((await card.boundingBox())!.height).toBeLessThan(230);
    await page.getByRole("button",{name:"Replace OpenAI API key"}).tap();
    let panel=page.getByRole("dialog"),field=panel.getByLabel("New API key");
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute("type","password");
    await expect(field).toHaveValue("");
    await field.fill("fictional-replacement-for-test");
    fail=true;
    await panel.getByRole("button",{name:"Save Key",exact:true}).tap();
    await expect(panel.getByRole("alert")).toHaveText("Unable to save key. Try again.");
    await expect(field).toHaveValue("fictional-replacement-for-test");
    fail=false;
    await panel.getByRole("button",{name:"Save Key",exact:true}).tap();
    await expect(panel).toHaveCount(0);
    await expect(card).toContainText("stored••••2222");
    expect(writes.at(-1)).toMatchObject({id:"openai",key:"fictional-replacement-for-test",label:"OpenAI"});
    await page.reload();await expect(card).toContainText("stored••••2222");
    for(const [id,label] of [["anthropic","Anthropic (Claude)"],["grok","xAI Grok"],["gemini","Google Gemini"]]) {
      await page.getByRole("button",{name:`Add ${label} API key`}).tap();
      panel=page.getByRole("dialog");field=panel.getByLabel("New API key");
      await expect(field).toHaveValue("");
      await field.fill(`fictional-${id}-for-test`);
      await panel.getByRole("button",{name:"Save Key",exact:true}).tap();
      await expect(panel).toHaveCount(0);
      expect(writes.at(-1)).toMatchObject({id,key:`fictional-${id}-for-test`,label});
      await page.reload();
      await page.getByRole("button",{name:`Replace ${label} API key`}).tap();
      await expect(page.getByRole("dialog").getByLabel("New API key")).toHaveValue("");
      await page.getByRole("button",{name:"Cancel",exact:true}).tap();
    }
    await page.clock.install();const before=reads;await page.clock.fastForward(90000);expect(reads).toBe(before);
    expect(await page.locator(".admin-page").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  });
});

test("AI Studio shows discovered models awaiting pricing only after an on-demand refresh",async({page})=>{
  let discovered=false, reads=0;
  await page.clock.install();
  await page.route("**/api-server/api/admin/ai-studio/models",async route=>{
    reads++;
    await route.fulfill({json:{providers:[{...studioProvider,pricingUrl:"https://developers.openai.com/api/docs/pricing",discoveredModels:discovered?[{id:"gpt-future",label:"New provider model",releasedAt:"2026-10-05T00:00:00Z"}]:[]}],models:[model],disabledProviders:[],customProviders:[]}});
  });
  await page.goto("/admin?tab=ai-studio&e2e=1");
  await expect(page.getByText("Connected",{exact:true})).toBeVisible();
  discovered=true;
  const before=reads;
  await page.clock.fastForward(120000);
  expect(reads).toBe(before);
  await expect(page.getByText("New provider model",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Check connection",exact:true}).click();
  await page.getByText("New models · 1 need pricing",{exact:true}).click();
  await expect(page.getByText("New provider model",{exact:true})).toBeVisible();
  await expect(page.getByText("Pricing review needed",{exact:true})).toBeVisible();
  await expect(page.getByRole("switch",{name:"Enable New provider model",exact:true})).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Provider models & pricing"})).toHaveAttribute("href","https://developers.openai.com/api/docs/pricing");
});
