import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// A click shows the next page's loading blocks straight away, even while the server is slow
// (docs/decisions/2026-11-05-performance.md).
test("a link shows the loading blocks before the server answers", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInByEmail(page, `e2e-instant-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Lets the link fetch its loading blocks ahead of the click.
  await page.waitForLoadState("networkidle");

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/schedule\?_rsc=/, async (route) => {
    if (!route.request().headers()["next-router-prefetch"]) {
      await held;
    }
    await route.continue();
  });

  await page.getByRole("link", { name: "Schedule" }).filter({ visible: true }).first().click();
  await expect(page.locator('main [aria-busy="true"]')).toBeVisible({ timeout: 2_000 });

  release();
  await expect(page).toHaveURL(/\/schedule/);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
});
