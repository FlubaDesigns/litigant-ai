import {test as base, expect} from "@playwright/test";
import { TEMPLATES } from "../../../lib/api-zod/src/templates";
export const test=base.extend({
  page: async ({page},use)=>{
    // Public layout tests are isolated from the live business profile service.
    await page.route('**/socialFooterApi?site=litigant-ai', route => route.fulfill({json:{site:'litigant-ai',links:[]}}));
    await page.route("**/api-server/api/**",async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.includes("/report/")){await route.fulfill({status:404,json:{message:"Not found"}});return;}
      let json:unknown={};
      if(path.endsWith("/billing/defaults")) json={signupBonusCredits:500};
      if(path.endsWith("/billing/products")) json={packs:[]};
      if(path.endsWith("/limits")) json={limits:{maxLitigants:10,overdraftLimit:500}};
      if(path.endsWith("/providers")) json={providers:[],configured:[]};
      if(path.endsWith("/templates")) json=TEMPLATES;
      if(path.endsWith("/session-estimate")) json={estimatedCredits:12,maxCredits:500,config:route.request().postDataJSON().config};
      await route.fulfill({json});
    });
    await use(page);
  },
});
export {expect};
