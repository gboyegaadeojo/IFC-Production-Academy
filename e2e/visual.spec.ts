import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Visual checkpoints for DESIGN-REQUIREMENTS Milestones A and B (§8, §13, §14): the learner home in
// its new, pending, and member states and the admin shell, at 390px and 1440px. Screenshots go to
// SCREENSHOT_DIR (CI uploads them for review). Only fake seed data and generated example.com
// accounts appear. Also checks there's no horizontal overflow and that the drawer handles focus.

const DIR = process.env.SCREENSHOT_DIR ?? "test-results/screenshots";
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Viewports are set explicitly; runs once, in desktop");

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(0);
}

async function capture(page: Page, name: string) {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const viewport of VIEWPORTS) {
  test(`learner home: new and pending at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInByEmail(page, `visual-new-${viewport.name}-${Date.now()}@example.com`);

    // New volunteer: one clear next step, every department discoverable.
    await expect(page.getByRole("link", { name: "Explore departments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "From joining to serving" })).toBeVisible();
    await capture(page, `home-new-${viewport.name}`);

    // Pending: the request status comes first; other departments stay discoverable.
    await page
      .getByRole("article", { name: "Camera Operations" })
      .getByRole("button", { name: "Request to join Camera Operations" })
      .click();
    await expect(page.getByRole("heading", { name: "Your request" })).toBeVisible();
    await expect(page.getByText("Waiting for a leader")).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore departments" })).toHaveCount(0);
    await capture(page, `home-pending-${viewport.name}`);

    await openAccountMenu(page);
    await capture(page, `account-menu-${viewport.name}`);
  });

  test(`learner home: member with a published course at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Avery is a fake seed member of Camera Operations, which has one fake published course.
    await signInByEmail(page, "avery.volunteer@example.com");
    await expect(page.getByRole("heading", { name: "Your departments" })).toBeVisible();
    // Other tests may publish more Camera courses in the same run, so match any real count.
    await expect(page.getByText(/\d+ courses? published/).first()).toBeVisible();
    // Membership is never shown as approval to serve.
    await expect(page.getByText("Approved to serve", { exact: true })).toHaveCount(1);
    await capture(page, `home-member-${viewport.name}`);
  });

  test(`admin shell at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Emery is the fake seed Production Director.
    await signInByEmail(page, "emery.director@example.com");
    await page.goto("/admin/members");
    await expect(
      page.getByRole("heading", { level: 1, name: "Membership requests" }),
    ).toBeVisible();
    await capture(page, `admin-members-${viewport.name}`);

    if (viewport.width < 1024) {
      // Below 1024px the sidebar is a drawer: focus moves in, Escape closes, focus returns.
      const trigger = page.getByRole("button", { name: "Open admin menu" });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Admin" });
      await expect(drawer).toBeVisible();
      // Wait for the opening transition to finish before capturing.
      await expect(drawer).toHaveCSS("opacity", "1");
      await expect(drawer.getByRole("link", { name: "Back to Academy" })).toBeVisible();
      // Focus moves into the drawer, to its first control.
      await expect(drawer.getByRole("button", { name: "Close admin" })).toBeFocused();
      await page.screenshot({ path: `${DIR}/admin-drawer-${viewport.name}.png` });
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
    } else {
      const nav = page.getByRole("navigation", { name: "Admin" });
      await expect(nav.getByRole("link", { name: "Membership requests" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });
}
