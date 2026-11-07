import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

const SAMPLE_COURSE = "cccccccc-0000-4000-8000-000000000001";

// ADD-REPORT-03; the course page's coloured Actions menu, option 1, approved 2026-11-07.
test("a leader assigns a course from its page, with a due date", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  // A new person, so no other test's assignments get in the way. Their name starts as the email's
  // first part.
  const name = `e2e-assign-${testInfo.project.name}-${Date.now()}`.toLowerCase();
  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await signInByEmail(learner, `${name}@example.com`);

  // A volunteer's menu has no Assign.
  await learner.goto(`/courses/${SAMPLE_COURSE}`);
  await learner.getByRole("button", { name: "Actions" }).click();
  await expect(learner.getByRole("link", { name: /^Go to / })).toBeVisible();
  await expect(learner.getByRole("button", { name: /Assign to someone/ })).toHaveCount(0);

  await signInByEmail(page, "casey.leader@example.com");
  await page.goto(`/courses/${SAMPLE_COURSE}`);
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("button", { name: /Assign to someone/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Assign / })).toBeVisible();

  await page.getByRole("searchbox", { name: "Find a person" }).fill(name);
  await page.getByRole("radio", { name: new RegExp(name) }).check();
  await page.locator("label", { hasText: "In 2 weeks" }).click();
  await page.getByRole("button", { name: `Assign to ${name}` }).click();
  await expect(page.getByText(new RegExp(`Assigned to ${name}, due .+\\.`))).toBeVisible();

  // Choosing them again shows they're assigned, and a new date changes it.
  await page.getByRole("searchbox", { name: "Find a person" }).fill(name);
  await expect(page.getByText(/Already assigned · due/)).toBeVisible();
  await page.locator("label", { hasText: "No due date" }).click();
  await page.getByRole("button", { name: `Assign to ${name}` }).click();
  await expect(
    page.getByText(`${name} was already assigned. There's no due date now.`),
  ).toBeVisible();

  // They hear about it.
  await learner.goto("/home");
  await expect(
    learner.getByRole("main").getByText(/Assigned by a leader|A leader asked you to take this\./),
  ).toBeVisible();
  await learnerContext.close();
});
