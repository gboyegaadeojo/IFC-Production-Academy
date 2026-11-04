import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// ADD-REPORT-02.
test("a volunteer sees their results on Profile", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: /Your profile/ })).toBeVisible();
  await expect(page.getByText("Quizzes passed")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your quizzes" })).toBeVisible();
});

test("a leader sees a course's progress, and can filter it", async ({ page }) => {
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/reports?report=progress");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  const finished = page.getByRole("button", { name: /^Finished/ });
  await expect(finished).toBeVisible();
  await finished.click();
  await expect(finished).toHaveAttribute("aria-pressed", "true");
});
