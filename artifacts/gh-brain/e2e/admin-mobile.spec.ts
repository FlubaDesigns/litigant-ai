import {test, expect} from "./fixtures";

const longId = "a-long-existing-record-identifier-that-must-wrap-on-a-phone";
const model = {id:"gpt-5",model:"gpt-5",label:"GPT model with a long descriptive name",provider:"openai",providerLabel:"OpenAI",inputRatePer1k:0.001,outputRatePer1k:0.002,userInputPer1k:0.002,userOutputPer1k:0.004,multiplier:2,exampleCredits:12,qualityScore:80,enabled:true,available:true};
const email = {id:"welcome",label:"Welcome email",trigger:longId,tokens:[],canDisable:true,enabled:true,defaultSubject:"Welcome",defaultHeadline:"Welcome",defaultIntroText:"Hello"};
const responses: Record<string,unknown> = {
  "/admin/stats":{userCount:9,sessionCount:12,txCount:9,recentSessions:0},
  "/admin/checklist":{items:[{id:"owner-item",section:"owner",text:"Review the provider configuration on your phone",checked:false,steps:["Open API Keys"]}]},
  "/admin/system-health":{status:"ok",collections:{credit_transactions:9},last24h:{newSessions:0},last7d:{errorSessions:1,feedbackEntries:2,activeSessions:100,errorRate:"1.0"}},
  "/admin/ai-studio/models":{models:[model],disabledProviders:[],customProviders:[]},
  "/admin/seat-briefs":{seatIds:["orchestrator"],active:{orchestrator:"Coordinate the discussion."},overrides:{}},
  "/admin/pricing":{creditValueUsd:0.01,models:[model]},
  "/admin/api-keys":{providers:[{id:"openai",label:"OpenAI",maskedKey:"••••hidden",source:"env",baseUrl:"https://api.example.test/very/long/provider/address"}]},
  "/admin/users":{users:[{id:longId,email:"long-address-for-mobile-layout@example.test",displayName:"Layout fixture",creditBalance:5500}],hasMore:false},
  "/admin/sessions":{sessions:[{id:longId,title:"A session question that should remain readable on a narrow phone",userId:longId,status:"complete"}],hasMore:false},
  "/admin/transactions":{transactions:[{id:longId,userId:longId,type:"purchase",amount:50,balanceAfter:100}],hasMore:false},
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
      if (tab.id === "overview" || tab.id === "health") {
        const rows=page.locator(".admin-page .row.layout__split-2");
        await expect(rows).toHaveCount(tab.id === "health" ? 4 : 2);
        for (const row of await rows.all()) {
          const cards=await row.locator(".lgt-card").all();
          expect(cards).toHaveLength(2);
          const left=await cards[0].boundingBox(), right=await cards[1].boundingBox();
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

test("desktop retains table columns and mobile key editing uses the same form", async ({page}) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto("/admin?tab=api-keys&e2e=1");
  const table=page.locator("table[data-mobile-cards]");
  await expect(table).toHaveCSS("display","table");
  await expect(table.locator("thead")).toBeVisible();
  await page.setViewportSize({width:360,height:800});
  await expect(table).toHaveCSS("display","block");
  const edit=page.getByRole("button",{name:"Edit OpenAI API key"});
  // Buttons animate their dimensions when crossing the desktop/mobile breakpoint.
  await expect.poll(async () => (await edit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await edit.click();
  await expect(page.getByRole("button",{name:"Update Key",exact:true})).toBeVisible();
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
