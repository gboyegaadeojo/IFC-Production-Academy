import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { adminNavLink } from "./support/admin-nav";
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
  await leader.getByRole("link", { name: "Admin" }).first().click();
  await expect(leader.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await (await adminNavLink(leader, "Training Academy", "Membership requests")).click();
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
  await expect(audio.getByText("Member", { exact: true })).toBeVisible();
  await expect(audio.getByText(/^Approved:/)).toHaveCount(0);

  await volunteerContext.close();
  await leaderContext.close();
});

test("a leader invites someone, who signs in from the link and joins", async ({ browser }) => {
  // Devon leads Audio (seed data) and creates a one-person invitation.
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "devon.leader@example.com");
  await leader.goto("/admin/invitations");
  await leader
    .getByRole("radiogroup", { name: "Invite to" })
    .getByRole("radio", { name: "Audio Engineering" })
    .check();
  // The preview shows what the person will see.
  await expect(
    leader
      .getByRole("complementary", { name: "What they'll see" })
      .getByText("You're invited to Audio Engineering"),
  ).toBeVisible();
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
    guest.getByRole("article", { name: "Audio Engineering" }).getByText("Member", { exact: true }),
  ).toBeVisible();

  // It was for one person, so it's now used up.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInByEmail(other, `e2e-late-${Date.now()}@example.com`);
  await other.goto(path);
  await expect(other.getByRole("heading", { name: "This invitation can't be used" })).toBeVisible();

  await leader.reload();
  // Used up, so it moves from Open to "Used or expired".
  await leader.getByRole("link", { name: /^Used or expired/ }).click();
  await expect(
    leader
      .getByRole("region", { name: "Invitations" })
      .getByRole("listitem")
      .filter({ hasText: "E2E invitation" })
      .first(),
  ).toContainText("All places used");

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
  await page.getByLabel("Video link or file").fill("https://example.com/not-a-video");
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByText("That doesn't look like a YouTube video link.")).toBeVisible();
  // A fake id: real unlisted links never go in the repo (SRS-LESSON-007).
  await page.getByLabel("Video link or file").fill("https://youtu.be/AbC_dEf-123?si=x");
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to the draft." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Video link or file")).toHaveValue(
    "https://www.youtube.com/watch?v=AbC_dEf-123",
  );
  // The church video library is off in CI; leaders are told, and can still add a file path.
  await expect(page.getByText("The church video library isn't connected yet.")).toBeVisible();
  await page.getByLabel("Where the video lives").selectOption("nas");
  await page.getByLabel("Video link or file").fill("../outside.mp4");
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(
    page.getByText(/Use the file's path inside the training videos folder/),
  ).toBeVisible();
  await page.getByLabel("Where the video lives").selectOption("youtube");
  await page.getByLabel("Video link or file").fill("https://youtu.be/AbC_dEf-123");
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to the draft." })).toBeVisible();
  await page.getByRole("link", { name: "Back to the course" }).click();

  // A quiz (SRS-QUIZ-001..003): a question with its correct answer marked, and the pass mark.
  const sections = page.getByRole("navigation", { name: "Course sections" });
  await sections.getByRole("link", { name: "Quizzes" }).click();
  await page.getByLabel("New quiz title").fill("Framing check");
  await page.getByRole("button", { name: "Add quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Framing check" })).toBeVisible();
  await expect(page.getByText("Pass mark 80% · 3 attempts")).toBeVisible();
  await page.getByRole("link", { name: "Add question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Where do the speaker's eyes go?");
  await page.getByLabel("Answer 1", { exact: true }).fill("On the top third line");
  await page.getByLabel("Answer 2", { exact: true }).fill("In the centre");
  await page.getByLabel("Correct (answer 1)").check();
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("heading", { name: "Questions (1)" })).toBeVisible();
  await expect(page.getByText("(correct)")).toBeVisible();
  await page.getByLabel("Pass mark (%)").fill("100");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to the draft." })).toBeVisible();
  await page.getByRole("link", { name: "Course", exact: true }).click();
  await expect(page.getByText("Pass mark 100% · 3 attempts")).toBeVisible();

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

test("a leader publishes an SOP, attaches it to a lesson, and a member opens it", async ({
  browser,
}) => {
  // Workflow E (SPEC §3) and SRS-LESSON-005. The file is a few fake bytes, not a real SOP.
  const stamp = Date.now();
  const sopName = `E2E power-up ${stamp}`;
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "casey.leader@example.com");
  await leader.goto("/admin/sops");
  await leader.getByLabel("SOP title").fill(sopName);
  await leader.getByRole("button", { name: "Create SOP" }).click();
  await expect(leader.getByRole("heading", { level: 1, name: sopName })).toBeVisible();
  await expect(leader.getByText("Not published yet").first()).toBeVisible();

  // Only real PDFs and images are stored, whatever the file is called.
  await leader.getByLabel("SOP file").setInputFiles({
    name: "not-really.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>not a pdf</html>"),
  });
  await leader.getByRole("button", { name: "Upload file" }).click();
  await expect(leader.getByText("Upload a PDF, PNG, or JPEG file.")).toBeVisible();
  await leader.getByLabel("SOP file").setInputFiles({
    name: "fake-sop.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fake SOP for end-to-end tests %%EOF"),
  });
  await leader.getByRole("button", { name: "Upload file" }).click();
  await expect(leader.getByText("fake-sop.pdf").first()).toBeVisible();
  await leader.getByLabel("What changed?").fill("First version");
  await leader.getByRole("button", { name: "Publish" }).click();
  await expect(leader.getByText("Version 1 is current")).toBeVisible();

  // Attach it to a lesson in a new course, then publish the course.
  await leader.goto("/admin/curriculum");
  await leader.getByText("Add course to Level 1, Camera Operations").click();
  await leader.getByLabel("Course title").first().fill(`E2E SOP course ${stamp}`);
  await leader.getByRole("button", { name: "Create course" }).first().click();
  await expect(
    leader.getByRole("heading", { level: 1, name: `E2E SOP course ${stamp}` }),
  ).toBeVisible();
  const courseId = new URL(leader.url()).pathname.split("/").pop() ?? "";
  await leader.getByLabel("New module title").fill("Before the service");
  await leader.getByRole("button", { name: "Add module" }).click();
  await leader.getByLabel("New lesson title").fill("Powering up");
  await leader.getByRole("button", { name: /^Add lesson/ }).click();
  await leader.getByRole("link", { name: "Powering up" }).click();
  await leader.getByLabel("SOP to attach").selectOption({ label: sopName });
  await leader.getByRole("button", { name: "Attach SOP" }).click();
  await expect(
    leader.getByRole("region", { name: "Resources" }).getByRole("link", { name: sopName }),
  ).toBeVisible();
  await leader.getByRole("link", { name: "Back to the course" }).click();
  const sections = leader.getByRole("navigation", { name: "Course sections" });
  await sections.getByRole("link", { name: "Publish" }).click();
  await leader.getByLabel("What changed?").fill("First version");
  await leader.getByRole("button", { name: "Publish" }).click();
  await expect(leader.getByText("Version 1 is live")).toBeVisible();
  await leaderContext.close();

  // Avery (a fake Camera Operations member) finds it in the library and from the lesson.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signInByEmail(member, "avery.volunteer@example.com");
  await member
    .getByRole("navigation", { name: "Academy" })
    .getByRole("link", { name: "SOPs" })
    .click();
  await member.getByLabel("Search").fill(`power-up ${stamp}`);
  await member.getByRole("button", { name: "Search" }).click();
  await member.getByRole("link", { name: new RegExp(sopName) }).click();
  await expect(member.getByRole("heading", { level: 1, name: sopName })).toBeVisible();
  await expect(member.getByText("Current", { exact: true }).first()).toBeVisible();

  // The file opens through a one-minute signed link, never a public address (SRS-SOP-006).
  const href = await member.getByRole("link", { name: /Open the PDF/ }).getAttribute("href");
  const redirect = await member.request.get(href ?? "", { maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  const signed = redirect.headers()["location"] ?? "";
  expect(signed).toContain("/storage/v1/object/sign/sops/");
  const file = await member.request.get(signed);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await member.goto(`/courses/${courseId}`);
  await member.getByRole("link", { name: /^(Start the course|Continue)/ }).click();
  await expect(member.getByRole("heading", { level: 1, name: "Powering up" })).toBeVisible();
  await expect(
    member
      .getByRole("region", { name: "Resources" })
      .getByRole("link", { name: new RegExp(sopName) }),
  ).toBeVisible();
  await memberContext.close();
});

test("a leader sets up competencies and a serving role, and a member sees what they need", async ({
  browser,
}) => {
  // SRS-COMP-001..004: competencies and roles are data the leader defines.
  const stamp = Date.now();
  const competency = `E2E framing ${stamp}`;
  const role = `E2E camera ${stamp}`;
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "casey.leader@example.com");
  await leader.goto("/admin/competencies");
  const camera = leader.getByRole("region", { name: "Camera Operations" });
  await camera.getByLabel("New competency name").fill(competency);
  await camera.getByRole("button", { name: "Add competency" }).click();
  await expect(camera.getByText(competency, { exact: true }).first()).toBeVisible();
  await camera.getByLabel("New role name").fill(role);
  await camera.getByRole("button", { name: "Add role" }).click();
  const roleItem = camera.getByRole("listitem").filter({ hasText: role });
  await expect(roleItem.getByText("Needs no competencies yet")).toBeVisible();
  await roleItem.getByText("Change what it needs").click();
  await roleItem.getByLabel(competency).check();
  await roleItem.getByRole("button", { name: "Save requirements" }).click();
  await expect(roleItem.getByText(`Needs ${competency}`)).toBeVisible();
  await leaderContext.close();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signInByEmail(member, "avery.volunteer@example.com");
  await member.goto("/departments/camera-operations");
  const readiness = member.getByRole("region", { name: "Practical skills and serving" });
  await expect(readiness.getByText(competency).first()).toBeVisible();
  const roleRow = readiness.getByRole("listitem").filter({ hasText: role });
  await expect(roleRow.getByText("Not yet")).toBeVisible();
  await expect(roleRow.getByText(`Needs ${competency}`)).toBeVisible();
  await memberContext.close();
});

test("a leader reads department reports and downloads one", async ({ page }) => {
  // SRS-REPORT-001..006: completion and readiness are separate reports; exports are CSV.
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Course completion by volunteer" })).toBeVisible();
  await page.getByRole("link", { name: "Readiness", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Competencies and Approved to Serve by volunteer" }),
  ).toBeVisible();
  const href = await page.getByRole("link", { name: /Download CSV/ }).getAttribute("href");
  const csv = await page.request.get(href ?? "");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Volunteer,Type,Competency or role,State,Since,Expires");
  await page.getByRole("link", { name: "Readiness matrix" }).click();
  await expect(
    page.getByRole("table", { name: "Approved to Serve by department and role" }),
  ).toBeVisible();
});

test("a leader pairs a mentor with a volunteer, and they share notes", async ({ browser }) => {
  // SRS-MENTOR-001..004. Casey leads Camera Operations and may mentor; Avery is a member.
  const stamp = Date.now();
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "casey.leader@example.com");
  await leader.goto("/admin/mentoring");
  const camera = leader.getByRole("region", { name: "Camera Operations" });
  await camera.getByLabel("Mentor").selectOption({ label: "Casey Example" });
  await camera.getByLabel("Volunteer").selectOption({ label: "Avery Example" });
  await camera.getByRole("button", { name: "Pair them" }).click();
  await expect(camera.getByText("Casey Example mentoring Avery Example")).toBeVisible();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signInByEmail(member, "avery.volunteer@example.com");
  await member.goto("/mentoring");
  await member
    .getByRole("link", { name: /Mentored by Casey Example/ })
    .first()
    .click();
  await member.getByLabel("New shared note").fill(`Fake question ${stamp}`);
  await member.getByRole("button", { name: "Share note" }).click();
  await expect(member.getByText(`Fake question ${stamp}`)).toBeVisible();
  // Volunteers never get a private-notes area.
  await expect(member.getByRole("heading", { name: "Your private notes" })).toHaveCount(0);
  await memberContext.close();

  await leader.goto("/mentoring");
  await leader
    .getByRole("link", { name: /Mentoring Avery Example/ })
    .first()
    .click();
  await expect(leader.getByText(`Fake question ${stamp}`)).toBeVisible();
  // Leaders hold mentoring.feedback but not private notes unless granted (SPEC §4).
  await expect(leader.getByRole("heading", { name: "Your private notes" })).toHaveCount(0);
  await leaderContext.close();
});

test("a Platform Admin manages people and departments but not memberships", async ({ page }) => {
  await signInByEmail(page, "frankie.admin@example.com");
  await openAccountMenu(page);
  await page.getByRole("link", { name: "Admin" }).first().click();

  await expect(await adminNavLink(page, "People & Teams", "People and roles")).toBeVisible();
  await expect(await adminNavLink(page, "Training Academy", "Departments")).toBeVisible();
  await expect(await adminNavLink(page, "System & Settings", "Audit log")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Membership requests" })).toHaveCount(0);

  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "This area isn't open to you" })).toBeVisible();

  await page.goto("/admin/people?q=devon");
  await page.getByRole("link", { name: /Devon Example/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Devon Example" })).toBeVisible();
  await expect(
    page.getByRole("paragraph").filter({ hasText: /^Department Leader, Audio Engineering$/ }),
  ).toBeVisible();

  await (await adminNavLink(page, "System & Settings", "Audit log")).click();
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
