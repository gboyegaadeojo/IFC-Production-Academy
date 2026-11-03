import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { ensureScreenshotDir, SCREENSHOT_DIR } from "./support/screenshots";

// Thirty people signed in and using the app at the same moment (app review, item 11). This runs the
// app on the test machine, not on Cloudflare, so it shows whether the app and database cope, and
// not Cloudflare's limits. Accounts are fake.

const PEOPLE = 30;
const PAGES = ["/home", "/schedule", "/sops"];

test("thirty people use the app at the same time", async ({ browser, baseURL, isMobile }) => {
  test.skip(isMobile, "Runs once, in desktop");
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
  test.setTimeout(420_000);
  ensureScreenshotDir();
  const stamp = Date.now();
  const contexts = await Promise.all(
    Array.from({ length: PEOPLE }, () => browser.newContext({ baseURL })),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  // Sign-ins run a few at a time, as a real group would arrive.
  for (let i = 0; i < PEOPLE; i += 5) {
    await Promise.all(
      pages
        .slice(i, i + 5)
        .map((page, n) => signInByEmail(page, `load-${i + n}-${stamp}@example.com`)),
    );
  }
  const times: number[] = [];
  for (const path of PAGES) {
    await Promise.all(
      pages.map(async (page) => {
        const start = Date.now();
        const response = await page.goto(path);
        times.push(Date.now() - start);
        expect(response?.status(), path).toBe(200);
      }),
    );
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const slowest = times.at(-1) ?? 0;
  writeFileSync(
    `${SCREENSHOT_DIR}/thirty-people.txt`,
    `median ${median}ms, slowest ${slowest}ms\n`,
  );
  expect(slowest, "the slowest page, in milliseconds").toBeLessThan(30_000);
  await Promise.all(contexts.map((context) => context.close()));
});
