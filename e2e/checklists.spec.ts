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
});
