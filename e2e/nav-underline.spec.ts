import { expect, test, type Locator, type Page } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

const academyNav = (page: Page) => page.getByRole("navigation", { name: "Academy" }).first();

/** True when the sliding underline sits under this link's words. */
async function underlineIsUnder(page: Page, link: Locator) {
  const marker = await page.getByTestId("nav-marker").boundingBox();
  const box = await link.boundingBox();
  return (
    marker !== null &&
    box !== null &&
    Math.abs(marker.x - (box.x + 12)) < 2 &&
    Math.abs(marker.width - (box.width - 24)) < 2
  );
}

// The header's sliding underline, chosen by G on 2026-11-03. Phones use the tab bar instead.
test("the underline follows the mouse and keyboard, then returns", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Phones have no header links");
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/home");
  const nav = academyNav(page);
  const training = nav.getByRole("link", { name: "Training" });
  const schedule = nav.getByRole("link", { name: "Schedule" });
  await expect(training).toHaveAttribute("aria-current", "page");
  await expect.poll(() => underlineIsUnder(page, training)).toBe(true);

  await schedule.hover();
  await expect.poll(() => underlineIsUnder(page, schedule)).toBe(true);
  await expect(training).toHaveAttribute("aria-current", "page");

  await page.getByRole("heading", { level: 1 }).first().hover();
  await expect.poll(() => underlineIsUnder(page, training)).toBe(true);

  await schedule.focus();
  await expect.poll(() => underlineIsUnder(page, schedule)).toBe(true);
  await schedule.blur();
  await expect.poll(() => underlineIsUnder(page, training)).toBe(true);

  await schedule.click();
  await expect(schedule).toHaveAttribute("aria-current", "page");
  await page.getByRole("heading", { level: 1 }).first().hover();
  await expect.poll(() => underlineIsUnder(page, schedule)).toBe(true);
});
