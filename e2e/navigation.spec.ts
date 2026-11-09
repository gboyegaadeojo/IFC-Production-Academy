import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Side bar B and phone bar A (decision 2026-11-09). Fake seed accounts only.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

test("the side bar names each page in sections, and folds to icons", async ({ page, isMobile }) => {
  test.skip(isMobile, "The side bar is for tablets and computers");
  await signInByEmail(page, "avery.volunteer@example.com");
  const sidebar = page.locator("aside[data-folded]");
  const nav = page.getByRole("navigation", { name: "Academy" });
  await expect(
    nav.getByRole("group", { name: "Learn" }).getByRole("link", { name: "Courses" }),
  ).toBeVisible();
  await expect(
    nav.getByRole("group", { name: "Serve" }).getByRole("link", { name: "SOPs" }),
  ).toBeVisible();

  // Light or dark is in the account menu here.
  await openAccountMenu(page);
  await expect(page.getByRole("switch", { name: "Dark mode" })).toBeVisible();
  await page.keyboard.press("Escape");

  const fold = page.getByRole("button", { name: "Icons only" });
  await fold.click();
  await expect(fold).toHaveAttribute("aria-pressed", "true");
  await expect(sidebar).toHaveAttribute("data-folded", "true");
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeLessThan(80);
  // Folded, each link still has its name for screen readers and as a tooltip.
  await expect(nav.getByRole("link", { name: "Schedule" })).toBeVisible();

  // The device remembers it.
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-folded", "true");
  await page.getByRole("button", { name: "Icons only" }).click();
  await expect(sidebar).toHaveAttribute("data-folded", "false");
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(160);
});

test("on a phone, the tab bar floats clear of the screen's edges", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phones only");
  await signInByEmail(page, "avery.volunteer@example.com");
  const bar = page.getByRole("navigation", { name: "Academy" });
  const box = await bar.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  if (box && viewport) {
    expect(viewport.height - (box.y + box.height)).toBeGreaterThanOrEqual(8);
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(viewport.width - (box.x + box.width)).toBeGreaterThanOrEqual(8);
  }
  await bar.getByRole("link", { name: "Schedule" }).click();
  await expect(bar.getByRole("link", { name: "Schedule" })).toHaveAttribute("aria-current", "page");
});
