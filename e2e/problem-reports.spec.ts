import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Report a problem (health check follow-up, 2026-11-11): a volunteer sends a note from the account
// menu, and a Platform Admin reads it in Admin → Problem reports and marks it sorted. Uses the
// shared seed admin, so desktop only, one at a time.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a volunteer reports a problem and an admin sorts it", async ({ browser }) => {
  const stamp = Date.now();
  const note = `The tick on Camera 2 went back ${stamp}`;

  const volunteerContext = await browser.newContext();
  const volunteer = await volunteerContext.newPage();
  await signInByEmail(volunteer, `e2e-report-${stamp}@example.com`);
  await openAccountMenu(volunteer);
  await volunteer.getByRole("button", { name: "Report a problem" }).click();
  const sheet = volunteer.getByRole("dialog", { name: "Report a problem" });
  await expect(sheet).toBeVisible();
  // It shows what goes with the note: the page, but never its query.
  await expect(sheet.getByText(/^Page: \/home$/)).toBeVisible();
  await sheet.getByLabel("What happened?").fill(note);
  await sheet.getByRole("button", { name: "Send to the team" }).click();
  await expect(sheet.getByText("Thanks. Your note reached the team.")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).first().click();
  await expect(sheet).toBeHidden();
  // Volunteers don't get the Admin page.
  await volunteer.goto("/admin/problem-reports");
  await expect(volunteer.getByText(note)).toHaveCount(0);
  await volunteerContext.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInByEmail(admin, "frankie.admin@example.com");
  await admin.goto("/admin/problem-reports");
  await expect(admin.getByRole("heading", { level: 1, name: "Problem reports" })).toBeVisible();
  const report = admin.getByRole("listitem").filter({ hasText: note });
  await expect(report.getByText("Page: /home")).toBeVisible();
  await expect(report.getByText("Open", { exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Mark as sorted" }).click();
  await expect(admin.getByRole("listitem").filter({ hasText: note })).toHaveCount(0);
  await admin.getByRole("link", { name: "All" }).click();
  await expect(
    admin.getByRole("listitem").filter({ hasText: note }).getByText("Sorted", { exact: true }),
  ).toBeVisible();
  await adminContext.close();
});
