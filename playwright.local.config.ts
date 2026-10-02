process.env.SIKA_LOCAL_MODE = "true";

import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "local-analysis.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", ...devices["Desktop Chrome"] },
  webServer: {
    command:
      "corepack pnpm db:deploy && corepack pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      SIKA_LOCAL_MODE: "true",
      DATABASE_URL: "file:/private/tmp/sika-analysis-e2e.db",
    },
    timeout: 120000,
  },
});
