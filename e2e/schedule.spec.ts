import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Service types, the Matrix, and calendars (decision record 9, stage 1). Needs the local Supabase
// stack with the fake seed accounts; desktop project only, one at a time.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a scheduler sets up a service type, makes its dates, and sees them in the Matrix", async ({
  page,
}) => {
  const name = `E2E service ${Date.now()}`;
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/schedule/types");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Starts (Winnipeg time)").fill("10:05");
  await page.getByLabel("Length in minutes").fill("105");
  await page.getByRole("button", { name: "Add service type" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page
    .getByLabel("Position", { exact: true })
    .selectOption({ label: "Sample role (seed data) (Camera Operations)" });
  await page.getByRole("button", { name: "Add position" }).click();
  await expect(
    page
      .getByRole("region", { name: "Positions" })
      .getByRole("listitem")
      .filter({ hasText: "Sample role (seed data)" }),
  ).toHaveCount(1);

  await page.getByLabel("How many").fill("2");
  await page.getByRole("button", { name: "Make services" }).click();
  await expect(page.getByText(/Made 2 services/)).toBeVisible();

  await page.goto("/admin/schedule/matrix");
  const chip = page.getByRole("link", { name, exact: true });
  if ((await chip.count()) > 0) {
    await chip.click();
  }
  const matrix = page.getByRole("table", { name: new RegExp(`^${name}`) });
  await expect(matrix.getByRole("rowheader", { name: /Sample role \(seed data\)/ })).toBeVisible();
  await expect(matrix.getByRole("link", { name: "Open" })).toHaveCount(2);

  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("table").first()).toBeVisible();
});

test("a volunteer taps a day on their calendar", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/schedule");
  const calendar = page.getByRole("region", { name: "Calendar" });
  await expect(calendar.getByRole("table")).toBeVisible();
  await calendar.getByRole("link", { name: /today/ }).click();
  await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
  await expect(page.locator("#day-heading")).toBeVisible();
});
