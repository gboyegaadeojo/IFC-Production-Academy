import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import {
  clearMailFor,
  mailpitAvailable,
  signInByEmail,
  signInLinkFor,
} from "./support/email-sign-in";

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
  await openAccountMenu(volunteer);
  await expect(volunteer.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await volunteer.keyboard.press("Escape");
  const audio = volunteer.getByRole("article", { name: "Audio Engineering" });
  await audio.getByRole("button", { name: "Request to join Audio Engineering" }).click();
  await expect(audio.getByText("Request sent")).toBeVisible();

  // Devon leads Audio (seed data) and approves it.
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "devon.leader@example.com");
  await openAccountMenu(leader);
  await leader.getByRole("link", { name: "Admin" }).click();
  await expect(leader.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await leader
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Membership requests" })
    .click();
  await expect(
    leader.getByRole("heading", { level: 1, name: "Membership requests" }),
  ).toBeVisible();
  // Devon leads Audio only, so Camera Operations isn't listed.
  await expect(leader.getByRole("heading", { level: 2, name: "Camera Operations" })).toHaveCount(0);

  const request = leader.getByRole("listitem").filter({ hasText: email });
  await request.getByText("Add a note").click();
  await request.getByLabel("Note (optional)").fill("Welcome to the audio team");
  await request.getByRole("button", { name: /^Approve/ }).click();
  // The card moves from Waiting to Members.
  await leader
    .getByRole("navigation", { name: "Membership views" })
    .getByRole("link", { name: /^Members/ })
    .click();
  await expect(leader.getByRole("listitem").filter({ hasText: email })).toContainText("Joined");

  // The volunteer is now a member. Membership is not approval to serve.
  await volunteer.reload();
  await expect(
    volunteer.getByRole("article", { name: "Audio Engineering" }).getByText("You're a member"),
  ).toBeVisible();

  await volunteerContext.close();
  await leaderContext.close();
});

test("a leader invites someone, who signs in from the link and joins", async ({ browser }) => {
  // Devon leads Audio (seed data) and creates a one-person invitation.
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "devon.leader@example.com");
  await leader.goto("/admin/invitations");
  await leader.getByLabel("Invite to").selectOption({ label: "Audio Engineering" });
  await leader.getByLabel("Note for you (optional)").fill("E2E invitation");
  await leader.getByRole("button", { name: "Create invitation link" }).click();
  await expect(
    leader.getByRole("heading", { name: "Your invitation link is ready" }),
  ).toBeVisible();
  await expect(leader.getByRole("img", { name: "QR code for the invitation link" })).toBeVisible();
  const link = await leader.getByLabel("Invitation link", { exact: true }).inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{32}$/);
  const path = new URL(link).pathname;

  // A new person opens it signed out: no details until they sign in.
  const email = `e2e-invited-${Date.now()}@example.com`;
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(path);
  await expect(guest.getByRole("heading", { name: "You're invited" })).toBeVisible();
  await expect(guest.getByText("Audio Engineering")).toHaveCount(0);
  await clearMailFor(email);
  await guest.getByLabel("Email address").fill(email);
  await guest.getByRole("button", { name: "Email me a sign-in link" }).click();
  // Wait for the request to finish (it also sets the pending-invitation cookie) before using the
  // link; the email can arrive a moment before the sign-in token is saved.
  await expect(guest.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await guest.goto(await signInLinkFor(email));

  // The email link returns them to the invitation.
  await expect(guest).toHaveURL(new RegExp(`${path}$`));
  await guest.getByRole("button", { name: "Accept and join Audio Engineering" }).click();
  await expect(guest).toHaveURL(/\/home$/);
  await expect(
    guest.getByRole("article", { name: "Audio Engineering" }).getByText("You're a member"),
  ).toBeVisible();

  // It was for one person, so it's now used up.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInByEmail(other, `e2e-late-${Date.now()}@example.com`);
  await other.goto(path);
  await expect(other.getByRole("heading", { name: "This invitation can't be used" })).toBeVisible();

  await leader.reload();
  await expect(leader.getByRole("row").filter({ hasText: "E2E invitation" }).first()).toContainText(
    "All places used",
  );

  await Promise.all([leaderContext.close(), guestContext.close(), otherContext.close()]);
});

test("a leader builds, publishes, and revises a course", async ({ page }) => {
  // Casey leads Camera Operations (seed data). Workflow C (SPEC §3), decided 2026-10-30.
  const title = `E2E framing ${Date.now()}`;
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/curriculum");
  await expect(page.getByRole("heading", { level: 1, name: "Curriculum" })).toBeVisible();

  await page.getByText("Add course to Level 1, Camera Operations").click();
  await page.getByLabel("Course title").first().fill(title);
  await page.getByRole("button", { name: "Create course" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Not published yet")).toBeVisible();

  await page.getByLabel("New module title").fill("Getting started");
  await page.getByRole("button", { name: "Add module" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Getting started" })).toBeVisible();

  await page.getByLabel("New lesson title").fill("Rule of thirds");
  await page.getByRole("button", { name: /^Add lesson/ }).click();
  await page.getByRole("link", { name: "Rule of thirds" }).click();
  await page.getByLabel("Lesson text").fill("Place the speaker's eyes on the top third line.");
  // A link that isn't a YouTube video is explained, not saved (SRS-LESSON-003).
  await page.getByLabel("YouTube video (optional)").fill("https://example.com/not-a-video");
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByText("That doesn't look like a YouTube video link.")).toBeVisible();
  // A fake id: real unlisted links never go in the repo (SRS-LESSON-007).
  await page.getByLabel("YouTube video (optional)").fill("https://youtu.be/AbC_dEf-123?si=x");
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to the draft." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("YouTube video (optional)")).toHaveValue(
    "https://www.youtube.com/watch?v=AbC_dEf-123",
  );
  await page.getByRole("link", { name: "Back to the course" }).click();

  const sections = page.getByRole("navigation", { name: "Course sections" });
  await sections.getByRole("link", { name: "Publish" }).click();
  await page.getByLabel("What changed?").fill("First version");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Version 1 is live")).toBeVisible();

  // Published content is locked; editing starts a draft and keeps version 1 live.
  await page.getByRole("button", { name: "Edit course" }).click();
  await expect(page.getByText("You're editing a draft")).toBeVisible();
  await sections.getByRole("link", { name: "Details" }).click();
  await page.getByLabel("Title", { exact: true }).fill(`${title} (revised)`);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to the draft." })).toBeVisible();
  await sections.getByRole("link", { name: "Publish" }).click();
  await page.getByLabel("What changed?").fill("Renamed the course");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Version 2 is live")).toBeVisible();

  await sections.getByRole("link", { name: "History" }).click();
  const history = page.getByRole("region", { name: "Version history" });
  await expect(history.getByText(`Version 1: ${title}`, { exact: true })).toBeVisible();
  await expect(history.getByText("First version")).toBeVisible();
  await expect(history.getByRole("button", { name: "Restore as draft version 1" })).toBeVisible();
});

test("a Platform Admin manages people and departments but not memberships", async ({ page }) => {
  await signInByEmail(page, "frankie.admin@example.com");
  await openAccountMenu(page);
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
  await openAccountMenu(page);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const path of [
    "/admin",
    "/admin/invitations",
    "/admin/curriculum",
    "/admin/people",
    "/admin/departments",
    "/admin/audit",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "This area isn't open to you" })).toBeVisible();
  }
});
