import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// SRS-NOTIF-002: people choose which notifications also come by email. Each switch saves on its
// own, and leader-only choices are offered only to leaders. Needs the local Supabase stack.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a volunteer turns an email off and it stays off", async ({ page }, testInfo) => {
  const email = `e2e-notify-${testInfo.project.name}-${Date.now()}@example.com`;
  await signInByEmail(page, email);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

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
