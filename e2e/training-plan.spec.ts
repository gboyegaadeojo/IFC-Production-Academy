import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// Home Page mock, Design D, approved 2026-11-05: a plan to work down, with departments beside it.
test("someone new gets a plan that moves on as they go", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInByEmail(page, `e2e-plan-${testInfo.project.name}-${Date.now()}@example.com`);

  const plan = page.getByRole("region", { name: "Getting started" });
  await expect(plan.getByText("0 of 4 done")).toBeVisible();
  await expect(plan.getByRole("link", { name: /^Add your name/ })).toHaveAttribute(
    "href",
    "/profile",
  );
  await expect(plan.getByRole("link", { name: /Join a department/ })).toBeVisible();

  await expect(page.getByRole("region", { name: "Keep exploring" })).toBeVisible();

  // Asking to join counts as a step done, and never as being on the team.
  await page
    .getByRole("article", { name: "Camera Operations" })
    .getByRole("button", { name: "Request to join Camera Operations" })
    .click();
  await expect(plan.getByText("1 of 4 done")).toBeVisible();
  await expect(plan.getByText("Request sent. Waiting for a leader.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toHaveCount(0);
});

test("a member's plan leads with the next thing to do", async ({ page }) => {
  // Avery is a fake seed member of Camera Operations.
  await signInByEmail(page, "avery.volunteer@example.com");
  await expect(page.getByRole("heading", { level: 1, name: /^Welcome back/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Coming up" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your departments" })).toBeVisible();
  // Serving stays explained, and lessons alone never read as approval.
  await expect(page.getByText("How serving works")).toBeVisible();
});
