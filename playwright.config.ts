import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local runs read .env.local; CI sets the same variables in the job.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// Magic links use Supabase's site_url (http://localhost:3000), so the sign-in tests need 3000.
// E2E_PORT lets the signed-out tests run when 3000 is busy.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

const LOAD_TEST = /thirty-people\.spec\.ts/;
// Safari's engine on an iPhone 13: only the screens-fit check, which Chrome can't stand in for.
const IPHONE_TEST = /iphone\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: [LOAD_TEST, IPHONE_TEST],
      use: { ...devices["Desktop Chrome"] },
    },
    { name: "mobile", testIgnore: [LOAD_TEST, IPHONE_TEST], use: { ...devices["Pixel 7"] } },
    { name: "iphone", testMatch: IPHONE_TEST, use: { ...devices["iPhone 13"] } },
    // Runs after the others, on an otherwise quiet machine, so its limit measures the app and not
    // the rest of the test suite competing for the same server.
    {
      name: "load",
      testMatch: LOAD_TEST,
      dependencies: ["desktop", "mobile"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI tests the production build; locally the dev server is fine.
    command: `${process.env.CI ? "npm run start" : "npm run dev"} -- --port ${port}`,
    url: `${baseURL}/sign-in`,
    // Never reuse whatever already holds the port: it might be a different app.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
