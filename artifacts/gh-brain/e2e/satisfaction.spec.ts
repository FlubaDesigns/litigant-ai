import {test,expect} from './fixtures';
import {SATISFACTION_QUESTIONS} from '../../../lib/api-zod/src/satisfaction';
for (const width of [360,1280]) test(`satisfaction ratings save, retry, reload and report at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 // Isolated browser identity only; production authentication is unchanged.
 await page.route('**/src/lib/firebase.ts*',route=>route.fulfill({contentType:'application/javascript',body:`export const auth={currentUser:{uid:'fixture-owner',getIdToken:async()=> 'fixture-token'}};export const db={};export const isConfigured=false;export default {};`}));
 let saved:any=null;let failLoad=true;let failSave=true;const writes:any[]=[];
 await page.route('**/api-server/api/feedback/satisfaction/test-session',route=>{
  if(failLoad){failLoad=false;return route.fulfill({status:503,json:{error:'Unavailable'}});}
  return route.fulfill({json:{ratings:saved}});
 });
 await page.route('**/api-server/api/feedback',route=>{
  writes.push(route.request().postDataJSON());
  if(failSave){failSave=false;return route.fulfill({status:503,json:{error:'Please retry your ratings.'}});}
  const {answered,satisfied,reuse}=route.request().postDataJSON();saved={answered,satisfied,reuse};return route.fulfill({json:{saved:true}});
 });
 async function open(){
  await page.goto('/session?e2e=1');
  await page.waitForFunction(()=>typeof(window as any).__testPdfExport==='function');
  await page.evaluate(()=>(window as any).__testPdfExport('A completed answer.'));
  await page.getByText('Rate your experience · optional',{exact:true}).click();
 }
 await open();await page.getByRole('button',{name:'Retry loading ratings'}).click();
 const save=page.getByRole('button',{name:'Save ratings',exact:true});await expect(save).toBeDisabled();
 for(const [i,question] of SATISFACTION_QUESTIONS.entries()){
  const radio=page.getByRole('group',{name:question.label}).getByRole('radio',{name:`${i+3} stars`,exact:true});
  const label=radio.locator('..');const box=await label.boundingBox();expect(box?.width).toBeGreaterThanOrEqual(44);expect(box?.height).toBeGreaterThanOrEqual(44);await label.click();
 }
 const first=page.getByRole('group',{name:SATISFACTION_QUESTIONS[0].label});await first.getByRole('radio',{name:'3 stars',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(first.getByRole('radio',{name:'4 stars',exact:true})).toBeChecked();
 await save.click();await expect(page.locator('.satisfaction-survey').getByRole('alert')).toContainText('Please retry');await expect(save).toBeEnabled();
 await save.click();await expect(page.locator('.satisfaction-survey').getByRole('status')).toContainText('Satisfaction Score is saved');
 expect(writes.at(-1)).toEqual({kind:'satisfaction',version:1,sessionId:'test-session',userId:'fixture-owner',answered:4,satisfied:4,reuse:5});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await open();await expect(first.getByRole('radio',{name:'4 stars',exact:true})).toBeChecked();
 await page.getByRole('group',{name:SATISFACTION_QUESTIONS[1].label}).getByRole('radio',{name:'2 stars',exact:true}).locator('..').click();await save.click();await expect(page.locator('.satisfaction-survey').getByRole('status')).toContainText('Satisfaction Score is saved');
 expect(saved).toEqual({answered:4,satisfied:2,reuse:5});
 await page.route('**/api-server/api/admin/satisfaction',route=>route.fulfill({json:{count:1,overall:11/3,averages:saved}}));
 await page.goto('/admin?tab=satisfaction&e2e=1');
 const summary=page.getByRole('region',{name:'Satisfaction Score'});
 await expect(summary).toContainText('3.67 / 5');await expect(summary).toContainText('1 response');await expect(summary).toContainText('2.00 / 5');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
