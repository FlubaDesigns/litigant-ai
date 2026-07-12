import { defineConfig } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:3000");

const CHROMIUM_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  undefined;

export default defineConfig({
  testDir: "./e2e",
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
