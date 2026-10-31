import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// SRS-AUTH-006: people view and update their own profile. Needs the local Supabase stack.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a volunteer changes the name leaders see", async ({ page }, testInfo) => {
  const email = `e2e-profile-${testInfo.project.name}-${Date.now()}@example.com`;
  await signInByEmail(page, email);

  await openAccountMenu(page);
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Volunteer", { exact: true })).toBeVisible();

  const name = page.getByLabel("Your name");
  await name.fill("   ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Enter the name/);

  await name.fill("  Sam   Example ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("main").getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Account: Sam Example" })).toBeVisible();

  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Sam Example" })).toBeVisible();
});
