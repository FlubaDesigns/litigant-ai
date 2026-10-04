import {test as base, expect} from "@playwright/test";
export const test=base.extend({
  page: async ({page},use)=>{
    await page.route("**/api-server/api/**",async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.includes("/report/")){await route.fulfill({status:404,json:{message:"Not found"}});return;}
      let json:unknown={};
      if(path.endsWith("/billing/defaults")) json={signupBonusCredits:500};
      if(path.endsWith("/billing/products")) json={packs:[]};
      if(path.endsWith("/limits")) json={maxLitigants:10,overdraftLimit:500};
      if(path.endsWith("/providers")) json={providers:[],configured:[]};
      if(path.endsWith("/templates")) json=[];
      if(path.endsWith("/session-estimate")) json={estimatedCredits:12,maxCredits:500,config:route.request().postDataJSON().config};
      await route.fulfill({json});
    });
    await use(page);
  },
});
export {expect};
