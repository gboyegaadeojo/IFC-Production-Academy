import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// SRS-PROG-009: a warning first, Cancel changes nothing, and confirming begins the course again.
test("a learner starts a course over, after a warning", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInByEmail(page, `e2e-restart-${testInfo.project.name}-${Date.now()}@example.com`);

  await page.goto("/courses");
  await page.getByLabel("Search courses").fill("Sample course");
  await page.getByRole("main").getByRole("listitem").getByRole("link").first().click();
  await page.getByRole("link", { name: "Start the course" }).click();
  await expect(page).toHaveURL(/\/lessons\//);
  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await expect(page.getByRole("button", { name: /Completed/ }).first()).toBeVisible();
  // The button changes on the tap, so wait for the save before leaving the page.
  await expect(page.getByRole("status").filter({ hasText: "Marked complete." })).toHaveCount(1);

  await page.goto(page.url().replace(/\/lessons\/.*$/, ""));
  const startOver = page.getByRole("button", { name: /^Start over/ });
  await startOver.click();
  const warning = page.getByRole("alertdialog");
  await expect(warning).toContainText("You can't undo this yourself.");
  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Your progress")).toBeVisible();

  await startOver.click();
  await page.getByRole("button", { name: "Yes, start over" }).click();
  await expect(page.getByRole("link", { name: "Start the course" })).toBeVisible();
  await expect(startOver).toHaveCount(0);
});
