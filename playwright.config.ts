// Playwright config for the self-QA harness (.qa/).
//
// Single worker + retries:0 is deliberate: the OTP request path is rate-limited
// to 5 requests / 60s per IP, and the smoke logs in all five roles from
// localhost. Parallelism or retries would re-fire OTP requests and trip the
// limit. The harness clears the relevant Redis keys before the run as a second
// guard.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./.qa",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.QA_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
