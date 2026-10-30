import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Admin and leader screens (SPEC §4, §8; SRS-MEM-003, SRS-RBAC-001). Needs the local Supabase stack
// with the fake seed accounts. These sign in as shared seed accounts, so they run one at a time and
// only in the desktop project.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a department leader approves a volunteer's request", async ({ browser }) => {
  const email = `e2e-approve-${Date.now()}@example.com`;

  // The volunteer asks to join Audio Engineering.
  const volunteerContext = await browser.newContext();
  const volunteer = await volunteerContext.newPage();
  await signInByEmail(volunteer, email);
  await expect(volunteer.getByRole("link", { name: "Admin" })).toHaveCount(0);
  const audio = volunteer.getByRole("article", { name: "Audio Engineering" });
  await audio.getByRole("button", { name: "Request to join Audio Engineering" }).click();
  await expect(audio.getByText("Request sent")).toBeVisible();

  // Devon leads Audio (seed data) and approves it.
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "devon.leader@example.com");
  await leader.getByRole("link", { name: "Admin" }).click();
  await expect(
    leader.getByRole("heading", { level: 1, name: "Membership requests" }),
  ).toBeVisible();
  // Devon leads Audio only, so Camera Operations isn't listed.
  await expect(leader.getByRole("heading", { level: 2, name: "Camera Operations" })).toHaveCount(0);

  const request = leader.getByRole("listitem").filter({ hasText: email });
  await request.getByLabel("Note (optional)").fill("Welcome to the audio team");
  await request.getByRole("button", { name: /^Approve/ }).click();
  // The card moves from Waiting to Members.
  await expect(leader.getByRole("listitem").filter({ hasText: email })).toContainText("Joined");

  // The volunteer is now a member. Membership is not approval to serve.
  await volunteer.reload();
  await expect(
    volunteer.getByRole("article", { name: "Audio Engineering" }).getByText("You're a member"),
  ).toBeVisible();

  await volunteerContext.close();
  await leaderContext.close();
});

test("a Platform Admin manages people and departments but not memberships", async ({ page }) => {
  await signInByEmail(page, "frankie.admin@example.com");
  await page.getByRole("link", { name: "Admin" }).click();

  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "People and roles" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Departments" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit log" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Membership requests" })).toHaveCount(0);

  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "This area isn't open to you" })).toBeVisible();

  await page.goto("/admin/people?q=devon");
  await page.getByRole("link", { name: /Devon Example/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Devon Example" })).toBeVisible();
  await expect(
    page.getByRole("paragraph").filter({ hasText: /^Department Leader, Audio Engineering$/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
});

test("a volunteer can't open the admin area", async ({ page }) => {
  await signInByEmail(page, `e2e-noadmin-${Date.now()}@example.com`);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  for (const path of ["/admin", "/admin/people", "/admin/departments", "/admin/audit"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "This area isn't open to you" })).toBeVisible();
  }
});
