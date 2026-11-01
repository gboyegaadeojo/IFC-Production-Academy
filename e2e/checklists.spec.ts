import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Pre-service checklists (decision record 9, stage 2). Needs the local Supabase stack with the
// fake seed accounts; desktop project only, one at a time.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a leader builds a checklist by pasting, then ticks, resets, and undoes on a service day", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = `E2E checklist ${stamp}`;
  const first = `Power on the camera ${stamp}`;
  // Emery is the fake seed Production Director, who leads every service's checklists.
  await signInByEmail(page, "emery.director@example.com");

  await page.goto("/admin/checklists");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Department").selectOption({ label: "Camera Operations" });
  await page.getByRole("button", { name: "Add checklist" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page
    .getByLabel("List", { exact: true })
    .fill(`# Setup\n- ${first}\n- Check the batteries ${stamp}`);
  await page.getByRole("button", { name: "Add these" }).click();
  await expect(page.getByText("Added 1 section and 2 items.")).toBeVisible();
  await page.getByLabel("Sample role (seed data)").check();
  await page
    .getByRole("region", { name: "Who it's for" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByText(/see this checklist first/).last()).toBeVisible();

  // A service tomorrow, so its checklist is open.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.goto("/admin/schedule");
  await page.getByLabel("Name").fill(`Checklist service ${stamp}`);
  await page.getByLabel("Date").fill(tomorrow);
  await page.getByLabel("Starts").fill("09:00");
  await page.getByLabel("Ends").fill("11:00");
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page).toHaveURL(/\/admin\/schedule\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").at(-1)!;

  await page.goto(`/serve/${eventId}`);
  const item = page.getByLabel(first);
  await item.check();
  await page.reload();
  await expect(page.getByLabel(first)).toBeChecked();
  await expect(page.getByText("Done by").first()).toBeVisible();

  await page.getByText("Clear every tick for this service").click();
  await page.getByRole("button", { name: "Reset checklists" }).click();
  await expect(page.getByText(/Cleared 1 tick/)).toBeVisible();
  await expect(page.getByLabel(first)).not.toBeChecked();
  await page.getByRole("button", { name: "Undo the last reset" }).click();
  await expect(page.getByLabel(first)).toBeChecked();

  // Every tick, reset, and undo is in the activity log, with the checklist edits.
  await page.goto(`/admin/checklists/activity?service=${eventId}`);
  const log = page.getByRole("list", { name: "Activity, newest first" });
  await expect(log.getByText("Undid the reset")).toBeVisible();
  await expect(log.getByText("Reset the service's checklists")).toBeVisible();
  await expect(log.getByText(first).first()).toBeVisible();
  await page.getByRole("link", { name: "Checklist edits" }).click();
  await expect(log.getByText(name).first()).toBeVisible();

  // The service's record: what was done and what wasn't, per department.
  await page.goto(`/admin/checklists/history/${eventId}`);
  const department = page.getByRole("region", { name: new RegExp(`^${name}`) });
  await expect(department.getByText("1 of 2 done")).toBeVisible();
  await expect(department.getByText(`Check the batteries ${stamp}`)).toBeVisible();
});

test("an admin copies a task list, makes it the default and back, then hides and restores it", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = `E2E list ${stamp}`;
  await signInByEmail(page, "emery.director@example.com");

  await page.goto("/admin/checklists");
  await page.getByLabel("List name").fill(name);
  await page.getByLabel("Start with").selectOption({ label: "A copy of Pre-Service Checklist" });
  await page.getByRole("button", { name: "Add list" }).click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

  // Names are unique ignoring capitals and extra spaces.
  await page.getByLabel("List name").last().fill(`  e2e LIST   ${stamp} `);
  await page.getByRole("button", { name: "Add list" }).click();
  await expect(page.getByText("Another task list already has that name.")).toBeVisible();

  await page.getByRole("button", { name: "Make this the default" }).click();
  await expect(page.getByText("This is the default list: new services use it.")).toBeVisible();
  const lists = page.getByRole("list", { name: "Task lists" });
  await expect(lists.getByRole("link", { name: new RegExp(`^${name}.*Default`) })).toBeVisible();

  // Back to the usual default, so the other tests keep their list.
  await lists.getByRole("link", { name: /^Pre-Service Checklist/ }).click();
  await page.getByRole("button", { name: "Make this the default" }).click();
  await expect(page.getByText("This is the default list: new services use it.")).toBeVisible();

  await lists.getByRole("link", { name: new RegExp(`^${name}`) }).click();
  await page.getByRole("button", { name: "Hide this list" }).click();
  const hidden = page.getByRole("region", { name: "Hidden lists" });
  await expect(hidden.getByText(name)).toBeVisible();
  await expect(lists.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  await hidden.getByRole("button", { name: `Restore ${name}` }).click();
  await expect(lists.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
});
