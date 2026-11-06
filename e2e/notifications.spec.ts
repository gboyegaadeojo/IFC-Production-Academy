import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// SRS-NOTIF-002: people choose which notifications also come by email. Each switch saves on its
// own, and leader-only choices are offered only to leaders. Needs the local Supabase stack.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a volunteer turns an email off and it stays off", async ({ page }, testInfo) => {
  const email = `e2e-notify-${testInfo.project.name}-${Date.now()}@example.com`;
  await signInByEmail(page, email);
  // The bell beside the account button opens them, on a phone and in the side bar.
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

  // Device alerts live on Get the app (docs/runbooks/push-alerts.md), reached from here and from
  // the account menu. CI has no alert keys, so it says they're off.
  await page
    .getByRole("region", { name: "Alerts on your phone" })
    .getByRole("link", { name: "Get the app" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Get the app" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Alerts on this device" })
      .getByText("Alerts aren't switched on yet."),
  ).toBeVisible();
  await expect(page.getByRole("group").filter({ hasText: "On iPhone or iPad" })).toBeVisible();
  await expect(page.getByText("None yet. Turn on alerts above")).toBeVisible();
  await openAccountMenu(page);
  await expect(page.getByRole("link", { name: "Get the app" })).toBeVisible();
  await page.goto("/notifications");

  const choices = page.getByRole("region", { name: "Email me" });
  await expect(choices.getByRole("group", { name: "Serving" })).toBeVisible();
  // Volunteers aren't asked about leaders' emails.
  await expect(choices.getByRole("group", { name: "Leading" })).toHaveCount(0);

  const join = choices.getByRole("switch", { name: /When I join a department/ });
  await expect(join).toBeChecked();
  await join.click();
  await expect(choices.getByRole("status")).toHaveText("Saved");

  await page.reload();
  await expect(
    page.getByRole("region", { name: "Email me" }).getByRole("switch", {
      name: /When I join a department/,
    }),
  ).not.toBeChecked();
});

test("a leader also sees the leading choices", async ({ page }) => {
  // Casey leads Camera Operations (fake seed data).
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/notifications");
  await expect(
    page.getByRole("region", { name: "Email me" }).getByRole("group", { name: "Leading" }),
  ).toBeVisible();
});
