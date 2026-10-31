import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { capture, ensureScreenshotDir, VIEWPORTS } from "./support/screenshots";

// Learning journey (DESIGN-REQUIREMENTS Milestone C, §6.3–6.5; SRS-MEM-005, SRS-MEM-006): a member
// goes from home to the department pathway, a course, and a lesson; a visitor can browse the
// pathway but not open lessons. Uses fake seed data: Avery is a Camera Operations member, and Camera
// Level 1 has the published "Sample course (seed data)".

const SAMPLE_COURSE = "cccccccc-0000-4000-8000-000000000001";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Viewports are set explicitly; runs once, in desktop");

test.beforeAll(() => {
  ensureScreenshotDir();
});

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

for (const viewport of VIEWPORTS) {
  test(`a member opens a course and a lesson at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInByEmail(page, "avery.volunteer@example.com");

    await page.getByRole("link", { name: "Open your pathway for Camera Operations" }).click();
    await expect(page).toHaveURL(/\/departments\/camera-operations$/);
    await expect(page.getByRole("heading", { level: 1, name: "Camera Operations" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Foundations" })).toBeVisible();
    // Readiness stays separate from courses (SPEC §3).
    await expect(page.getByRole("heading", { name: "Practical skills and serving" })).toBeVisible();
    await capture(page, `department-member-${viewport.name}`);

    await page.getByRole("link", { name: /Sample course \(seed data\)/ }).click();
    await expect(page).toHaveURL(new RegExp(`/courses/${SAMPLE_COURSE}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Sample course (seed data)" }),
    ).toBeVisible();
    await expect(page.getByText("Version 1")).toBeVisible();
    await capture(page, `course-member-${viewport.name}`);

    await page.getByRole("link", { name: "Start the course" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sample lesson" })).toBeVisible();
    await expect(page.getByText("Lesson 1 of 1")).toBeVisible();
    await expect(page.getByText("Fake lesson text for local development.")).toBeVisible();
    // No completion control exists yet, and nothing claims the lesson was watched.
    await expect(page.getByRole("button", { name: /complete/i })).toHaveCount(0);
    if (viewport.width >= 1024) {
      await expect(
        page
          .getByRole("complementary", { name: "Course outline" })
          .getByRole("link", { name: /Sample lesson/ }),
      ).toHaveAttribute("aria-current", "page");
    } else {
      await page.getByText(/Course outline · 1 of 1/).click();
      await expect(page.getByRole("link", { name: /Sample lesson/ }).first()).toBeVisible();
    }
    await capture(page, `lesson-member-${viewport.name}`);

    await page.getByRole("link", { name: "Back to the course" }).click();
    await expect(page).toHaveURL(new RegExp(`/courses/${SAMPLE_COURSE}$`));
  });

  test(`a visitor browses the pathway but can't open lessons at ${viewport.name}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInByEmail(page, `visual-visitor-${viewport.name}-${Date.now()}@example.com`);

    await page.getByRole("link", { name: "Camera Operations", exact: true }).click();
    await expect(page).toHaveURL(/\/departments\/camera-operations$/);
    await expect(page.getByText("Courses open once you're a member.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sample course \(seed data\)/ })).toHaveCount(0);
    await expect(page.getByText("Sample course (seed data)")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Request to join Camera Operations" }),
    ).toBeVisible();
    await capture(page, `department-visitor-${viewport.name}`);

    await page.goto(`/courses/${SAMPLE_COURSE}`);
    await expect(page.getByText("For Camera Operations members")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start the course" })).toHaveCount(0);
    await capture(page, `course-locked-${viewport.name}`);

    // A lesson link (any key) sends a visitor back to the course page, not to lesson content.
    await page.goto(`/courses/${SAMPLE_COURSE}/lessons/00000000-0000-4000-8000-000000000000`);
    await expect(page).toHaveURL(new RegExp(`/courses/${SAMPLE_COURSE}$`));

    // A department with nothing published shows an honest empty level.
    await page.goto("/departments/audio-engineering");
    await expect(page.getByText("No courses published in this level yet.").first()).toBeVisible();
    await capture(page, `department-empty-${viewport.name}`);
  });
}
