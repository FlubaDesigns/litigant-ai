import { defineConfig } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000");

const CHROMIUM_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  undefined;

export default defineConfig({
  testDir: "./e2e",
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "pnpm exec vite --host 127.0.0.1",
    url: "http://127.0.0.1:3000",
    env: {PORT:"3000",BASE_PATH:"/",VITE_FIREBASE_API_KEY:"",VITE_API_URL:"/api-server/api"},
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    headless: true,
    ignoreHTTPSErrors: true,
    launchOptions: {
      executablePath: CHROMIUM_EXECUTABLE,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
