import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each test file gets its own module registry so mocks never leak between files.
    isolate: true,
    pool: "forks",
    reporters: ["verbose"],
  },
});
