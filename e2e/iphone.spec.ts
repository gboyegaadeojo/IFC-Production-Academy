import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { capture, ensureScreenshotDir, expectFitsScreen } from "./support/screenshots";

// The learner screens on an iPhone 13 in WebKit, Safari's engine (the "iphone" project). Chrome
// keeps a too-wide grid column to the screen and Safari doesn't, so on an iPhone the service
// checklist zoomed out and Recently watched lost its done marks (2026-11-10), while every Chrome
// test passed. Avery is the fake seed Camera Operations member.

const SCREENS = [
  "/home",
  "/courses",
  "/explore",
  "/schedule",
  "/serve",
  "/sops",
  "/notifications",
  "/profile",
  "/help",
];

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("every learner screen fits an iPhone 13 in Safari's engine", async ({ page }) => {
  test.setTimeout(120_000);
  ensureScreenshotDir();
  await signInByEmail(page, "avery.volunteer@example.com");
  for (const path of SCREENS) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    await expectFitsScreen(page);
    await capture(page, `iphone${path.replace(/\//g, "_")}`);
  }
  // A course and a department page, reached the way people reach them.
  await page.goto("/courses");
  await page.locator('#main a[href^="/courses/"]').first().click();
  await expect(page).toHaveURL(/\/courses\/[^/]+/);
  await expectFitsScreen(page);
  await page.goto("/home");
  const department = page.locator('#main a[href^="/departments/"]').first();
  if ((await department.count()) > 0) {
    await department.click();
    await expect(page).toHaveURL(/\/departments\//);
    await expectFitsScreen(page);
  }
});
