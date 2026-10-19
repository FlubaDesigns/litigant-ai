import { test, expect } from './fixtures';

test('saved platform links appear automatically in a phone-sized footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  let links: Array<{platform:string;label:string;url:string}> = [];
  await page.route('**/socialFooterApi?site=litigant-ai', route => route.fulfill({json:{site:'litigant-ai',links}}));
  await page.goto('/');
  const footer = page.locator('[data-social-footer="litigant-ai"]');
  await expect(footer).toHaveCount(0);

  links = [{platform:'facebook',label:'Facebook',url:'https://www.facebook.com/profile.php?id=61595449803443'}];
  await page.clock.fastForward(61000);
  await expect(footer.getByRole('link', {name:'Facebook',exact:true})).toHaveAttribute('href',links[0].url);
  await expect(footer.getByRole('link', {name:'LinkedIn',exact:true})).toHaveCount(0);

  links = [...links, {platform:'linkedin',label:'LinkedIn',url:'https://www.linkedin.com/company/litigant-ai/'}];
  await page.clock.fastForward(61000);
  await expect(footer.getByRole('link')).toHaveCount(2);
  await expect(footer.getByRole('link', {name:'LinkedIn',exact:true})).toHaveAttribute('href',links[1].url);
  const box = await footer.getByRole('link', {name:'LinkedIn',exact:true}).boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  links = [];
  await page.clock.fastForward(61000);
  await expect(footer).toHaveCount(0);
});
