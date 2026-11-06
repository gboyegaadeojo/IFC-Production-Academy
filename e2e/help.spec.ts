import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Help and guides (ADD-HELP-01).

test("anyone can read the guides, signed in or not", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 1, name: "Help and guides" })).toBeVisible();
  await expect(page).toHaveURL(/\/help$/);
  // Signed out, there's no app navigation that would only lead back to sign-in, just Sign in.
  await expect(page.getByRole("navigation", { name: "Academy" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");

  await page.getByLabel("Search the guides").fill("practical");
  await expect(page.getByRole("main").getByRole("link", { name: /^Training/ })).toBeVisible();
  await page.getByLabel("Search the guides").fill("zzzznothing");
  await expect(page.getByText("Nothing matches.", { exact: false })).toBeVisible();
  await page.getByLabel("Search the guides").fill("");

  await page.getByRole("link", { name: /^Service Dashboard setup/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Service Dashboard: setup/ }),
  ).toBeVisible();
  // A link inside a guide stays in the app.
  await page.getByRole("link", { name: "the guide" }).first().click();
  await expect(page).toHaveURL(/\/help\/service-dashboard$/);
});

test("a guide that doesn't exist says so", async ({ page }) => {
  const response = await page.goto("/help/not-a-guide");
  expect(response?.status()).toBe(404);
});

test("Help in the menu opens the guide for the page you're on", async ({ page, isMobile }) => {
  test.skip(isMobile, "Shared seed accounts: desktop project only");
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
  await signInByEmail(page, "emery.director@example.com");
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help\/schedule$/);
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  // Signed in, help keeps the app's navigation.
  await expect(page.getByRole("navigation", { name: "Academy" }).first()).toBeAttached();
});
