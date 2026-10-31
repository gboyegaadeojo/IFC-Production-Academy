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

    // The quiz follows the last lesson; its rules show before starting (SRS-QUIZ-003).
    await page
      .getByRole("navigation", { name: "Lessons" })
      .getByRole("link", { name: /Sample quiz \(seed data\)/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sample quiz (seed data)" }),
    ).toBeVisible();
    await expect(page.getByText("Pass mark 80% · 3 attempts")).toBeVisible();
    await capture(page, `quiz-member-${viewport.name}`);

    await page.getByRole("link", { name: "Sample course (seed data)" }).click();
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

// Workflow B end to end (SPEC §3): a new volunteer joins Camera Operations, completes the sample
// lesson, passes the sample quiz, is assessed on the sample practical, and becomes Approved to Serve
// for the sample role; then undoes the lesson. Progress SRS-PROG-001..007, quizzes SRS-QUIZ-001..005,
// practicals SRS-ASSESS-001..007, competency SRS-COMP-001..004. A fresh account, so the result
// doesn't depend on other tests. Casey leads Camera Operations (seed data).
test("a new member learns, passes the quiz and practical, and is approved to serve", async ({
  browser,
}) => {
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

  // The lessons are done, but the required quiz isn't passed yet.
  await volunteer.goto(`/courses/${SAMPLE_COURSE}`);
  await expect(
    volunteer.getByText(
      "All required lessons done · quiz not passed yet · practical not passed yet",
    ),
  ).toBeVisible();

  // The quiz (SRS-QUIZ-001..005): one question at a time, an answer needed to move on, a check
  // before submitting, and a result the app works out.
  await volunteer.getByRole("link", { name: /^Continue/ }).click();
  await expect(
    volunteer.getByRole("heading", { level: 1, name: "Sample quiz (seed data)" }),
  ).toBeVisible();
  await volunteer.getByRole("button", { name: "Start the quiz" }).click();
  await expect(volunteer.getByRole("heading", { name: "Question 1 of 2" })).toBeVisible();
  await volunteer.getByRole("button", { name: "Next question" }).click();
  await expect(volunteer.getByText("Choose an answer.")).toBeVisible();
  await volunteer.getByLabel("Right answer").check();
  await volunteer.getByRole("button", { name: "Next question" }).click();
  await expect(volunteer.getByRole("heading", { name: "Question 2 of 2" })).toBeVisible();
  await volunteer.getByLabel("True", { exact: true }).check();
  await volunteer.getByRole("button", { name: "Check your answers" }).click();
  await expect(volunteer.getByRole("heading", { name: "Check your answers" })).toBeVisible();
  await expect(volunteer.getByText("Your answer: Right answer")).toBeVisible();
  await volunteer.getByRole("button", { name: "Submit answers" }).click();
  await expect(volunteer.getByRole("heading", { name: "You passed" })).toBeVisible();
  await expect(volunteer.getByText("You scored 100%: 2 of 2 correct.")).toBeVisible();
  // Passed, so the answers and explanations are shown (after_final_attempt).
  await expect(volunteer.getByText("Seed data explanation.")).toBeVisible();

  // Lessons and quiz done: the course waits for its practical (SRS-PROG-006).
  await volunteer.goto(`/courses/${SAMPLE_COURSE}`);
  await expect(volunteer.getByText("Awaiting your practical assessment")).toBeVisible();
  await expect(
    volunteer.getByText("All required lessons done · quiz passed · practical not passed yet"),
  ).toBeVisible();
  await expect(volunteer.getByText(/never approves you to serve/)).toBeVisible();

  // Workflow B (SPEC §3): the volunteer asks to be assessed, a leader ticks what they saw, and the
  // Academy works out the result. A pass grants the competency; Approved to Serve follows.
  await volunteer.getByRole("link", { name: /^Continue/ }).click();
  await expect(
    volunteer.getByRole("heading", { level: 1, name: "Sample practical (seed data)" }),
  ).toBeVisible();
  await expect(volunteer.getByText("Fake required step")).toBeVisible();
  await volunteer.getByRole("button", { name: "Request assessment" }).click();
  await expect(volunteer.getByText("Assessment requested")).toBeVisible();

  const name = email.split("@")[0] ?? email;
  const assessorContext = await browser.newContext();
  const assessor = await assessorContext.newPage();
  await signInByEmail(assessor, "casey.leader@example.com");
  // The leader dashboard puts the request first and counts training per department.
  await assessor.goto("/admin");
  await expect(assessor.getByRole("heading", { name: "Training" })).toBeVisible();
  await assessor.getByRole("link", { name: /Waiting for a practical assessment/ }).click();
  await expect(assessor.getByRole("heading", { level: 1, name: "Assessments" })).toBeVisible();
  await assessor
    .getByRole("region", { name: "Waiting for assessment" })
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("link", { name: /Assess now/ })
    .click();
  await expect(
    assessor.getByRole("heading", { name: `Sample practical (seed data): ${name}` }),
  ).toBeVisible();
  // There is nowhere to choose the result: only what was observed.
  await expect(assessor.getByRole("radio")).toHaveCount(0);
  await assessor.getByLabel(/Fake required step/).check();
  await assessor.getByLabel(/Fake optional step/).check();
  await assessor.getByLabel("Feedback for the volunteer").fill("Fake feedback: steady work.");
  await assessor.getByRole("button", { name: "Record assessment" }).click();
  await expect(assessor.getByText(/The result is Pass/)).toBeVisible();
  await assessorContext.close();

  await volunteer.reload();
  await expect(volunteer.getByText("Fake feedback: steady work.")).toBeVisible();
  await expect(volunteer.getByText("Passed", { exact: true }).first()).toBeVisible();

  // The course shows real progress, and never says this approves anyone to serve.
  await volunteer.goto(`/courses/${SAMPLE_COURSE}`);
  await expect(volunteer.getByText("You've finished this course")).toBeVisible();
  await expect(
    volunteer.getByText("All required lessons done · quiz passed · practical passed"),
  ).toBeVisible();
  await expect(
    volunteer.getByRole("link", { name: /Quiz: Sample quiz \(seed data\).*passed/ }),
  ).toBeAttached();

  // The certificate is issued only now, and says the course was finished, not that they can serve
  // (SRS-CERT-001..004).
  await volunteer.getByRole("button", { name: "Get your certificate" }).click();
  await expect(volunteer.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(volunteer.getByText("Valid certificate")).toBeVisible();
  await expect(
    volunteer.getByText(/Reference IFC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/),
  ).toBeVisible();
  await volunteer.goto("/profile");
  await expect(
    volunteer.getByRole("region", { name: "Certificates" }).getByText("Sample course (seed data)"),
  ).toBeVisible();

  // Approved to Serve is its own record, shown with the department (SRS-COMP-004).
  await volunteer.goto("/departments/camera-operations");
  const readiness = volunteer.getByRole("region", { name: "Practical skills and serving" });
  await expect(
    readiness.getByRole("listitem").filter({ hasText: "Sample role (seed data)" }),
  ).toContainText("Approved to serve");
  await expect(
    readiness.getByRole("listitem").filter({ hasText: "Sample skill (seed data)" }),
  ).toContainText("Approved");

  // Home shows what they've earned: approval to serve and the certificate, kept apart.
  await volunteer.goto("/home");
  const achievements = volunteer.getByRole("region", { name: "What you've earned" });
  await expect(achievements.getByText("Sample role (seed data)")).toBeVisible();
  await expect(achievements.getByText("Sample course (seed data)")).toBeVisible();

  // Workflow D (SPEC §3): now that they're approved, a leader schedules them and they confirm. The
  // candidate list shows the competency check before anyone is scheduled.
  const service = `E2E service ${Date.now()}`;
  const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const schedulerContext = await browser.newContext();
  const scheduler = await schedulerContext.newPage();
  await signInByEmail(scheduler, "casey.leader@example.com");
  await scheduler.goto("/admin/schedule");
  await scheduler.getByLabel("Name").fill(service);
  await scheduler.getByLabel("Date").fill(nextWeek);
  await scheduler.getByLabel("Starts").fill("09:00");
  await scheduler.getByLabel("Ends").fill("11:00");
  await scheduler.getByRole("button", { name: "Add event" }).click();
  await expect(scheduler.getByRole("heading", { level: 1, name: service })).toBeVisible();
  await scheduler
    .getByLabel("Role")
    .selectOption({ label: "Sample role (seed data) (Camera Operations)" });
  await scheduler.getByRole("button", { name: "Add position" }).click();
  await scheduler.getByText("Schedule someone").click();
  await scheduler.getByLabel("Volunteer").selectOption({ label: `${name} (approved)` });
  await scheduler.getByRole("button", { name: "Schedule", exact: true }).click();
  // The position now shows who's in it and the check result.
  const position = scheduler
    .getByRole("region", { name: "Positions" })
    .getByRole("listitem")
    .filter({ hasText: name });
  await expect(position.getByText("Waiting for a reply")).toBeVisible();
  await expect(position.getByText("Approved to serve")).toBeVisible();
  await schedulerContext.close();

  await volunteer.goto("/schedule");
  const upcoming = volunteer.getByRole("region", { name: "Coming up" });
  await expect(upcoming.getByText(service, { exact: true })).toBeVisible();
  await upcoming.getByRole("button", { name: `Confirm ${service}` }).click();
  await expect(volunteer.getByText("Confirmed. Thank you!")).toBeVisible();

  // Undo, for a mis-tap.
  await volunteer.goto(`/courses/${SAMPLE_COURSE}`);
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
