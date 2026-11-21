import "dotenv/config";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || new URL(testUrl).pathname !== "/slotwise_auth_test") throw new Error("Set TEST_DATABASE_URL to the isolated slotwise_auth_test database. See README.");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2, // Bound concurrent native Argon2 memory and local browser load.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined } }],
  webServer: {
    command: "npm run start -- --port 3100",
    env: { DATABASE_URL: testUrl, AUTH_SECRET: randomBytes(32).toString("hex"), NEXTAUTH_URL: "http://127.0.0.1:3100",
      ...(process.env.SLOTWISE_TEST_NOW && { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ./tests/support/emergency-clock.mjs` }),
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
