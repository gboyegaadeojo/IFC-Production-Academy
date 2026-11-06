import { expect, test, type Page } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// SRS-NOTIF-001, -002; refinements approved 2026-11-06: the bell opens a panel (tap it again to
// close), and phone and email choices are one per group on their own page. Leader-only choices are
// offered only to leaders. Needs the local Supabase stack.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

/** The bell that's showing: the phone bar's or the side bar's (CSS hides the other). */
function bell(page: Page) {
  return page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true });
}

test("the bell opens a panel, and tapping it again closes it", async ({ page }, testInfo) => {
  await signInByEmail(page, `e2e-bell-${testInfo.project.name}-${Date.now()}@example.com`);
  await bell(page).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(bell(page)).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("link", { name: "See all notifications" })).toBeVisible();
  // Mark all read is always there, so people can find it, even with nothing unread.
  await expect(panel.getByRole("button", { name: "Mark all read" })).toBeVisible();

  await bell(page).click();
  await expect(panel).toHaveCount(0);

  // Escape closes it too, and the settings are a tap away.
  await bell(page).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await bell(page).click();
  await panel.getByRole("link", { name: "Notification settings" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Notification settings" }),
  ).toBeVisible();
});

test("a volunteer turns a group's emails off and it stays off", async ({ page }, testInfo) => {
  const email = `e2e-notify-${testInfo.project.name}-${Date.now()}@example.com`;
  await signInByEmail(page, email);
  await page.goto("/notifications/settings");

  // Device alerts are here and on Get the app (docs/runbooks/push-alerts.md). CI has no alert
  // keys, so it says they're off.
  await expect(
    page
      .getByRole("region", { name: "Alerts on this device" })
      .getByText("Alerts aren't switched on yet."),
  ).toBeVisible();
  await openAccountMenu(page);
  await expect(page.getByRole("link", { name: "Get the app" })).toBeVisible();
  await page.keyboard.press("Escape");

  const choices = page.getByRole("region", { name: "What to send me" });
  await expect(choices.getByRole("group", { name: "Serving" })).toBeVisible();
  // Volunteers aren't asked about leaders' emails.
  await expect(choices.getByRole("group", { name: "Leading" })).toHaveCount(0);

  const trainingEmail = choices
    .getByRole("group", { name: "Training" })
    .getByRole("button", { name: "Email" });
  await expect(trainingEmail).toHaveAttribute("aria-pressed", "true");
  await trainingEmail.click();
  await expect(choices.getByRole("status")).toHaveText("Saved");

  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "What to send me" })
      .getByRole("group", { name: "Training" })
      .getByRole("button", { name: "Email" }),
  ).toHaveAttribute("aria-pressed", "false");

  // Fine-tuning one kind back on leaves the group partly on.
  await page.getByText("Fine-tune each alert").click();
  await page
    .getByRole("group", { name: "When I join a department" })
    .getByRole("button", { name: "Email" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "What to send me" })
      .getByRole("group", { name: "Training" })
      .getByRole("button", { name: /Email/ }),
  ).toHaveAttribute("aria-pressed", "mixed");
});

test("a leader also sees the leading choices", async ({ page }) => {
  // Casey leads Camera Operations (fake seed data).
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/notifications/settings");
  await expect(
    page.getByRole("region", { name: "What to send me" }).getByRole("group", { name: "Leading" }),
  ).toBeVisible();
});
