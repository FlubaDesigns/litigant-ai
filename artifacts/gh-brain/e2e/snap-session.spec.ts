import { test } from '@playwright/test';
const ID_TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImIyNDg2Mzc0OTVjYjM4N2U0OWViNmRlMThkZjk5N2VlOGU1YWUyOTciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiTWFyeSIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9saXRpZ2FudC1haSIsImF1ZCI6ImxpdGlnYW50LWFpIiwiYXV0aF90aW1lIjoxNzg0MjI0NjU5LCJ1c2VyX2lkIjoiSHZpNnRseHFhN04yNzVwMDlxZ1NjT1ludXZ2MiIsInN1YiI6Ikh2aTZ0bHhxYTdOMjc1cDA5cWdTY09ZbnV2djIiLCJpYXQiOjE3ODQyMjQ2NTksImV4cCI6MTc4NDIyODI1OSwiZW1haWwiOiJsaXphcGVyY2V5QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbImxpemFwZXJjZXlAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiY3VzdG9tIn19.DJNhFQBsZFyoZ6lGFuIX_tra8DN4s8xg65C1k7v0lf2Vh5NtAXjy2OnSzlhzgvVzrFSWjuj4iPY-YVgvbcxpasoizNVj_TD4KAyMpOnrctqVJ6gA59XI1dtoMnVCOe8rqzwWE7eR62DhC-MlyTFJlEsOWvsnNwDBI2MCgCA9iT7XU2KTpqPKn0MdfO5BymSfuzPrKpW0dmDWlrmfqRnSFq5LgiuYSFe-Yo92LdSo8T8CYZ5tdyp_badQrL8kwC4-51DdKZI8Bi5n5nHNqLILai64vCmsFobVyXIYQnCTgeFaHyh96Xv7eQr34Tjvzad4MXgW8nfnPfqccYQQ-VS1FQ";
const REFRESH = "AMf-vBwBuEGc8hhXGfQWhRX_sbmP68UcAo5is1SjSarBMH-v9-g3-OHZKc4O6UHnWKSjDBNaA76uxlexxTnLjVJyjFTRGDKjByBEHnPCxyTii135bdBomNvM9ius6qTW8ccgwFI_bwZhmek3niIGFl1pw8eS6RhJ3ZUuGCFOf66gtYbQTJtU1Ts";
const UID = "Hvi6tlxqa7N275p09qgScOYnuvv2";
const API_KEY = "AIzaSyDVCA3xld3uApfSs8gvhA7QVpARwP6hMSI";
test('debug 1920', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ UID, ID_TOKEN, REFRESH, API_KEY }) => {
    const a = { uid: UID, email: 'lizapercey@gmail.com', emailVerified: true, displayName: 'Mary', isAnonymous: false,
      providerData: [{ providerId: 'password', uid: 'lizapercey@gmail.com', email: 'lizapercey@gmail.com', displayName: null, phoneNumber: null, photoURL: null }],
      stsTokenManager: { refreshToken: REFRESH, accessToken: ID_TOKEN, expirationTime: Date.now() + 3600*1000 },
      createdAt: '1700000000000', lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: '[DEFAULT]' };
    localStorage.setItem(`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(a));
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open('firebaseLocalStorageDb', 1);
      r.onupgradeneeded = (e: any) => e.target.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      r.onsuccess = (e: any) => { const db = e.target.result; const tx = db.transaction('firebaseLocalStorage', 'readwrite');
        tx.objectStore('firebaseLocalStorage').put({ fbase_key: `firebase:authUser:${API_KEY}:[DEFAULT]`, value: a });
        tx.oncomplete = () => res(); tx.onerror = () => rej(); };
      r.onerror = () => rej();
    });
  }, { UID, ID_TOKEN, REFRESH, API_KEY });
  await page.goto('/session', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // dump ALL elements that are NOT 1920px wide
  const narrowEls = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const results: string[] = [];
    all.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < 1800 && r.left < 50 && r.top < 600) {
        const s = window.getComputedStyle(el);
        const maxW = s.maxWidth;
        if (maxW !== 'none' || el.className?.toString().includes('max-w') || el.className?.toString().includes('container')) {
          results.push(`tag=${el.tagName} class="${el.className?.toString().slice(0,80)}" w=${Math.round(r.width)} left=${Math.round(r.left)} maxW=${maxW}`);
        }
      }
    });
    return results.slice(0, 20);
  });
  console.log('NARROW ELEMENTS WITH max-width:');
  narrowEls.forEach(e => console.log(e));

  await page.screenshot({ path: '/tmp/session-1920.png', fullPage: false });
});
