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

// ADD-REPORT-03.
test("a leader assigns a course, the volunteer sees it on Training, and it can be removed", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Shared seed accounts: desktop project only");
  test.setTimeout(90_000);
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/reports?report=progress");
  await page.getByRole("button", { name: "Assign to someone" }).click();
  await page.getByRole("searchbox", { name: "Who should take this course?" }).fill("Blake");
  await page.getByRole("radio", { name: "Blake Example" }).check();
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Assigned. They'll see it on Training.")).toBeVisible();

  const blakeContext = await browser.newContext();
  const blake = await blakeContext.newPage();
  await signInByEmail(blake, "blake.volunteer@example.com");
  await blake.goto("/home");
  // Picked up first if nothing's under way, otherwise listed under Coming up.
  const assigned = blake
    .getByRole("main")
    // Not the notification's "A leader asked you to take this course" in the side column.
    .getByText(/Assigned by a leader|A leader asked you to take this\./);
  await expect(assigned).toBeVisible();

  await page.getByRole("button", { name: /Blake Example/ }).click();
  await page.getByRole("button", { name: /Remove assignment/ }).click();
  await expect(page.getByText("Removed. Anything they've already done stays.")).toBeVisible();

  await blake.reload();
  await expect(blake.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(assigned).toHaveCount(0);
  await blakeContext.close();
});
