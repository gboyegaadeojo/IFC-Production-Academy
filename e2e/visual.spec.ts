import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import {
  capture,
  ensureScreenshotDir,
  SCREENSHOT_DIR as DIR,
  VIEWPORTS,
} from "./support/screenshots";

// Visual checkpoints for DESIGN-REQUIREMENTS Milestones A and B (§8, §13, §14): the learner home in
// its new, pending, and member states and the admin shell, at 390px and 1440px. Screenshots go to
// SCREENSHOT_DIR (CI uploads them for review). Only fake seed data and generated example.com
// accounts appear. Also checks there's no horizontal overflow and that the drawer handles focus.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Viewports are set explicitly; runs once, in desktop");

test.beforeAll(() => {
  ensureScreenshotDir();
});

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

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

  // Emery is the fake seed Production Director. One sign-in per viewport covers the admin shell and
  // every admin page, so the same address isn't sent links back to back (local rate limit).
  test(`admin shell and pages for the Production Director at ${viewport.name}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
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

    // Milestone D (DESIGN §7): one screenshot per admin page, with fake seed data only.
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await capture(page, `admin-dashboard-${viewport.name}`);

    await page.goto("/admin/members?view=members");
    await expect(
      page
        .getByRole("navigation", { name: "Membership views" })
        .getByRole("link", { name: /^Members/ }),
    ).toHaveAttribute("aria-current", "page");
    await capture(page, `admin-members-list-${viewport.name}`);

    await page.goto("/admin/invitations");
    await expect(page.getByRole("heading", { level: 1, name: "Invitations" })).toBeVisible();
    await capture(page, `admin-invitations-${viewport.name}`);

    await page.goto("/admin/curriculum");
    await expect(page.getByRole("heading", { level: 1, name: "Curriculum" })).toBeVisible();
    await capture(page, `admin-curriculum-${viewport.name}`);

    // The fake seed course in Camera Operations Level 1.
    await page.goto("/admin/curriculum/cccccccc-0000-4000-8000-000000000001");
    await expect(page.getByRole("navigation", { name: "Course sections" })).toBeVisible();
    await capture(page, `admin-course-${viewport.name}`);

    await page.goto("/admin/people");
    await expect(page.getByRole("heading", { level: 1, name: "People and roles" })).toBeVisible();
    await capture(page, `admin-people-${viewport.name}`);

    await page.getByRole("link", { name: /Avery Example/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Avery Example" })).toBeVisible();
    await capture(page, `admin-person-${viewport.name}`);

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
    await capture(page, `admin-audit-${viewport.name}`);
  });

  test(`departments for the Platform Admin at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInByEmail(page, "frankie.admin@example.com");
    await page.goto("/admin/departments");
    await expect(page.getByRole("heading", { level: 1, name: "Departments" })).toBeVisible();
    await capture(page, `admin-departments-${viewport.name}`);

    // Editing opens in a focused drawer that explains each status (DESIGN §7.7).
    await page.getByRole("button", { name: "Edit Lighting Operations" }).click();
    const drawer = page.getByRole("dialog", { name: "Edit Lighting Operations" });
    await expect(drawer).toHaveCSS("opacity", "1");
    await expect(drawer.getByText(/can't join yet/)).toBeVisible();
    await page.screenshot({ path: `${DIR}/admin-department-edit-${viewport.name}.png` });
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
}

// Tablet and small-laptop widths (DESIGN §8, §12): 768px and 1024px for the main screens. One
// sign-in per account; the viewport changes between captures.
const TABLET_VIEWPORTS = [
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
] as const;

test("learner screens at 768px and 1024px", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  for (const viewport of TABLET_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const [path, name] of [
      ["/home", "home-member"],
      ["/departments/camera-operations", "department-member"],
      ["/courses/cccccccc-0000-4000-8000-000000000001", "course-member"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await capture(page, `${name}-${viewport.name}`);
    }
  }
});

test("admin screens at 768px and 1024px", async ({ page }) => {
  await signInByEmail(page, "emery.director@example.com");
  for (const viewport of TABLET_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const [path, name] of [
      ["/admin", "admin-dashboard"],
      ["/admin/members", "admin-members"],
      ["/admin/curriculum", "admin-curriculum"],
      ["/admin/people", "admin-people"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await capture(page, `${name}-${viewport.name}`);
    }
  }
});
