import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { openAccountMenu } from "./support/account-menu";
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

    // Avery may already have opened the lesson (other tests), so either button may show.
    await page.getByRole("link", { name: /^(Start the course|Continue)/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sample lesson" })).toBeVisible();
    await expect(page.getByText("Lesson 1 of 1")).toBeVisible();
    await expect(page.getByText("Fake lesson text for local development.")).toBeVisible();
    // Completion is the learner's call; nothing claims the lesson was watched (SRS-LESSON-006).
    await expect(page.getByRole("button", { name: "Mark lesson complete" })).toBeVisible();
    await expect(page.getByText("nothing checks how much of the video you watched")).toBeVisible();
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

// Progress (SRS-PROG-001..007): a new volunteer joins Camera Operations, marks the sample lesson
// complete, sees it in the outline and on the course, and undoes it. A fresh account, so the result
// doesn't depend on other tests. Casey leads Camera Operations (seed data).
test("a new member marks a lesson complete and sees their progress", async ({ browser }) => {
  const email = `e2e-progress-${Date.now()}@example.com`;
  const volunteerContext = await browser.newContext();
  const volunteer = await volunteerContext.newPage();
  await signInByEmail(volunteer, email);
  const camera = volunteer.getByRole("article", { name: "Camera Operations" });
  await camera.getByRole("button", { name: "Request to join Camera Operations" }).click();
  await expect(camera.getByText("Request sent")).toBeVisible();

  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "casey.leader@example.com");
  await openAccountMenu(leader);
  await leader.getByRole("link", { name: "Admin" }).click();
  await leader.goto("/admin/members");
  await leader
    .getByRole("listitem")
    .filter({ hasText: email })
    .getByRole("button", { name: /^Approve/ })
    .click();
  await leader
    .getByRole("navigation", { name: "Membership views" })
    .getByRole("link", { name: /^Members/ })
    .click();
  await expect(leader.getByRole("listitem").filter({ hasText: email })).toContainText("Joined");
  await leaderContext.close();

  await volunteer.goto(`/courses/${SAMPLE_COURSE}`);
  await volunteer.getByRole("link", { name: "Start the course" }).click();
  await expect(volunteer.getByRole("heading", { level: 1, name: "Sample lesson" })).toBeVisible();
  await volunteer.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(volunteer.getByText(/You marked this lesson complete on/)).toBeVisible();
  await expect(
    volunteer.getByRole("link", { name: /Sample lesson.*completed/ }).first(),
  ).toBeAttached();

  // The course shows real progress, and never says this approves anyone to serve.
  await volunteer.goto(`/courses/${SAMPLE_COURSE}`);
  await expect(volunteer.getByText("You've finished this course")).toBeVisible();
  await expect(volunteer.getByText("All required lessons done")).toBeVisible();
  await expect(volunteer.getByText(/never approves you to serve/)).toBeVisible();

  // Undo, for a mis-tap.
  await volunteer
    .getByRole("link", { name: /Sample lesson/ })
    .first()
    .click();
  await volunteer.getByRole("button", { name: "Mark as not complete" }).click();
  await expect(volunteer.getByRole("button", { name: "Mark lesson complete" })).toBeVisible();

  // Home picks up where they left off.
  await volunteer.goto("/home");
  await expect(volunteer.getByRole("heading", { name: "Continue learning" })).toBeVisible();
  await expect(volunteer.getByRole("link", { name: /Next: Sample lesson/ })).toBeVisible();
  await volunteerContext.close();
});
