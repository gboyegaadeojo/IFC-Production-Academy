import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

const SAMPLE_COURSE = "cccccccc-0000-4000-8000-000000000001";

// Course Page mock, approved 2026-11-05: the title and main button, then tabs beside the lessons.
test("a course page shows its lessons, tabs, and actions", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInByEmail(page, `e2e-course-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.goto(`/courses/${SAMPLE_COURSE}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start the course" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lessons" })).toBeVisible();

  // The tabs switch on the page, and arrow keys move between them.
  await expect(page.getByText(/never approves you to serve/)).toBeVisible();
  await page.getByRole("tab", { name: "Quiz results" }).click();
  await expect(page.getByText("You haven't taken a quiz in this course yet.")).toBeVisible();
  await expect(page.getByText(/never approves you to serve/)).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "About" })).toHaveAttribute("aria-selected", "true");

  // Nothing to start over yet, so the menu only offers the department.
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("link", { name: /^Go to / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Start over/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /^Go to / })).toBeHidden();
});
