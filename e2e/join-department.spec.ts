import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail, signInLinkFor } from "./support/email-sign-in";

// Workflow A, first half (SPEC §3): sign in with an email link, see the departments, request to
// join. Needs the local Supabase stack (`npm run db:start`); Mailpit catches the email.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a new volunteer signs in, sees the departments, and requests to join", async ({
  page,
}, testInfo) => {
  // A fresh fake address per run and project, so reruns never collide.
  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;
  await signInByEmail(page, email);

  await expect(page.getByRole("heading", { level: 1, name: /^Welcome,/ })).toBeVisible();

  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(5);
  for (const name of [
    "Camera Operations",
    "Audio Engineering",
    "Computer Graphics and ProPresenter",
    "Camera Directing",
    "Lighting Operations",
  ]) {
    await expect(page.getByRole("article", { name })).toBeVisible();
  }

  const lighting = page.getByRole("article", { name: "Lighting Operations" });
  await expect(lighting.getByText("Coming soon")).toBeVisible();
  await expect(lighting.getByRole("button")).toHaveCount(0);

  const camera = page.getByRole("article", { name: "Camera Operations" });
  await camera.getByRole("button", { name: "Request to join Camera Operations" }).click();
  await expect(camera.getByText("Request sent")).toBeVisible();
  // Asking to join never makes someone a member, let alone approved to serve.
  await expect(camera.getByText("Member", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("article", { name: "Camera Operations" }).getByText("Request sent"),
  ).toBeVisible();
});

test("signing out ends the session", async ({ page }, testInfo) => {
  const email = `e2e-signout-${testInfo.project.name}-${Date.now()}@example.com`;
  await signInByEmail(page, email);

  await openAccountMenu(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a sign-in link works only once", async ({ page, context }, testInfo) => {
  const email = `e2e-once-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const link = await signInLinkFor(email);

  await page.goto(link);
  await expect(page).toHaveURL(/\/home$/);

  const other = await context.browser()!.newPage();
  await other.goto(link);
  await expect(other).toHaveURL(/error=link_invalid/);
  await other.close();
});
