import { chromium } from "playwright";

const CUSTOM_TOKEN = process.env.CUSTOM_TOKEN;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Load the app so the Firebase SDK bundle is present
await page.goto("http://localhost:80/", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(2000);

// Sign in via Firebase REST (signInWithCustomToken) then stash the idToken in
// a cookie/localStorage key the app reads on boot
const apiKey = await page.evaluate(() => {
  // The Vite app exposes this via import.meta.env, but it's also embedded in the
  // Firebase config object the app uses — grab it from the initialized app
  try {
    const apps = window.__FIREBASE_APPS__ || [];
    if (apps.length) return apps[0].options?.apiKey;
  } catch {}
  return null;
});
console.log("apiKey found:", !!apiKey);

// Call the Firebase REST API from inside the browser to exchange custom token → idToken
const idToken = await page.evaluate(async (args) => {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${args.apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: args.customToken, returnSecureToken: true }) }
  );
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d.idToken;
}, { apiKey, customToken: CUSTOM_TOKEN });

console.log("idToken length:", idToken?.length);

// Use the Firebase JS SDK (already loaded by the app) to complete sign-in
const signResult = await page.evaluate(async (token) => {
  try {
    // The app exposes firebase auth on window via its own module graph
    // Walk the module registry to find signInWithCustomToken
    const mod = Object.values(window.__vite_plugin_pwa_fallback__ || {});
    void mod;
    // Direct approach: call signInWithCustomToken on the app's auth instance
    const authMod = await import("/src/lib/firebase.ts").catch(() => null);
    if (!authMod) return { ok: false, err: "no firebase module" };
    const { signInWithCustomToken, getAuth } = await import(
      "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js"
    ).catch(() => ({}));
    if (!signInWithCustomToken) return { ok: false, err: "no signInWithCustomToken" };
    const auth = authMod.auth || getAuth();
    const cred = await signInWithCustomToken(auth, token);
    return { ok: true, uid: cred.user.uid };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}, CUSTOM_TOKEN);
console.log("sign-in:", JSON.stringify(signResult));

await browser.close();
