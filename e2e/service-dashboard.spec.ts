import { expect, test } from "@playwright/test";
import { adminNavLink } from "./support/admin-nav";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Service Dashboard (ADD-DASH-01 to 03). Needs the local Supabase stack with the fake seed accounts;
// desktop project only, one at a time.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a manager adds an editor, who changes the layout everyone sees", async ({ page }) => {
  // Emery is the fake seed Production Director.
  await signInByEmail(page, "emery.director@example.com");

  await page.goto("/admin");
  await (await adminNavLink(page, "Services & Scheduling", "Service Dashboard setup")).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Service Dashboard setup" }),
  ).toBeVisible();
  await page.goto("/admin/service-dashboard/editors");
  await expect(page.getByRole("heading", { name: /^Editors \(/ })).toBeVisible();

  if ((await page.getByRole("button", { name: "Remove Emery" }).count()) === 0) {
    await page.getByLabel("Find a person").fill("Emery");
    await page.getByRole("button", { name: /^Add Emery/ }).click();
    await expect(page.getByText(/can now edit/)).toBeVisible();
  }

  await page.goto("/admin/service-dashboard");
  await expect(page.getByRole("button", { name: "Save layout" })).toBeVisible();

  // Off the layout by default, because there's no mic yet.
  const stamp = Date.now();
  const name = `Layout ${stamp}`;
  await page.getByLabel("Layout name").fill(name);
  await page.getByRole("button", { name: "SOP shortcuts" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: /^SOP shortcuts, 4 wide/ })).toBeVisible();

  // Keyboard: Shift and an arrow resizes.
  await page.getByRole("group", { name: /^SOP shortcuts, 4 wide/ }).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByRole("group", { name: /^SOP shortcuts, 5 wide/ })).toBeVisible();

  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText(/^Layout saved/)).toBeVisible();

  // The saved layout is what the dashboard shows.
  await page.goto("/service-dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Service Dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "SOP shortcuts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit layout" })).toBeVisible();

  // Dragging by the dots moves a tile.
  await page.goto("/admin/service-dashboard");
  const dots = page.getByTestId("move-sops");
  await dots.scrollIntoViewIfNeeded();
  const box = await dots.boundingBox();
  expect(box).not.toBeNull();
  const tile = page.locator('[data-tile="sops"]');
  const before = await tile.evaluate((element) => (element as HTMLElement).style.left);
  await page.mouse.move(box!.x + 3, box!.y + 3);
  await page.mouse.down();
  await page.mouse.move(box!.x + 200, box!.y + 3, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => tile.evaluate((element) => (element as HTMLElement).style.left))
    .not.toBe(before);

  // Put the original back so other tests see the default.
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText(/^Layout saved/)).toBeVisible();
});

test("a person on no team doesn't get the dashboard", async ({ page }) => {
  await signInByEmail(page, `no-team-${Date.now()}@example.com`);
  await expect(page.getByRole("link", { name: "Service Dashboard" })).toHaveCount(0);
  await page.goto("/service-dashboard");
  await expect(page.getByRole("heading", { name: /isn't open to you/ })).toBeVisible();
});

test("on a small screen it asks you to open a computer", async ({ page }) => {
  await signInByEmail(page, "emery.director@example.com");
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto("/service-dashboard");
  await expect(page.getByRole("heading", { name: "Open this on a computer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Service Dashboard", exact: true })).toBeHidden();
});

test("the dashboard opens a service: notes save, and the checklist and team tiles show", async ({
  page,
}) => {
  await signInByEmail(page, "emery.director@example.com");
  const stamp = Date.now();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.goto("/admin/schedule");
  await page.getByLabel("Name").fill(`Dashboard service ${stamp}`);
  await page.getByLabel("Date").fill(tomorrow);
  await page.getByLabel("Starts").fill("09:00");
  await page.getByLabel("Ends").fill("11:00");
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page).toHaveURL(/\/admin\/schedule\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").at(-1)!;

  await page.goto(`/service-dashboard?service=${eventId}`);
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue(eventId);
  await expect(page.getByRole("region", { name: "Run of service" })).toContainText(
    "No run of service yet",
  );
  await expect(page.getByRole("region", { name: "Who's serving" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Checklist" })).toBeVisible();

  const notes = page.getByLabel("Shared with the team");
  await notes.fill(`Fake note ${stamp}`);
  await notes.blur();
  await expect(
    page.getByRole("region", { name: "Producer notes" }).getByText("Saved."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Shared with the team")).toHaveValue(`Fake note ${stamp}`);
});
