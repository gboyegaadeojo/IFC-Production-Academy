import { expect, test } from "@playwright/test";
import { mailpitAvailable } from "./support/email-sign-in";

// The public "I want to serve" page (docs/decisions/2026-11-01-onboarding-pathways.md): works
// signed out, lists open departments, and thanks the person by first name. Fake details only.

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("someone signed out says they'd like to serve", async ({ page }, testInfo) => {
  await page.goto("/serve-with-us");
  await expect(
    page.getByRole("heading", { level: 1, name: "Serve behind the scenes" }),
  ).toBeVisible();
  await page.getByLabel("Your name").fill("Riley Example");
  await page.getByLabel("Email").fill(`serve-${testInfo.project.name}-${Date.now()}@example.com`);
  const interests = page.getByRole("group", { name: /What interests you/ });
  await interests.getByText("Camera Operations").click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Thanks, Riley." })).toBeVisible();
});
