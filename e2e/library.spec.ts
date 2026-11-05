import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

test("Explore opens on its filters, and shows results only after a search", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/videos");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("heading", { level: 1, name: "Explore" })).toBeVisible();
  const search = page.getByLabel("Search courses and videos");
  await expect(page.getByRole("heading", { level: 2, name: /^Courses/ })).toHaveCount(0);
  await search.fill("no course or video has this title");
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await search.fill("Sample course");
  await expect(page.getByRole("heading", { level: 2, name: /^Courses/ })).toBeVisible();
});

test("a Production Director adds, renames, and removes a topic", async ({ page }) => {
  const name = `Fake topic ${Date.now()}`;
  await signInByEmail(page, "emery.director@example.com");
  await page.goto("/admin/topics");
  await page.getByRole("button", { name: "+ New topic" }).click();
  await page.getByLabel("New topic", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add topic" }).click();
  const chip = page.getByRole("button", { name, exact: true });
  await expect(chip).toBeVisible();
  await page.goto("/courses");
  await page.getByRole("button", { name: /^Topic/ }).click();
  await expect(page.getByRole("checkbox", { name })).toBeVisible();
  await page.goto("/admin/topics");
  await chip.click();
  await page.getByLabel("Topic name").fill(`${name} renamed`);
  await page.getByRole("button", { name: /^Rename/ }).click();
  const renamed = page.getByRole("button", { name: `${name} renamed`, exact: true });
  await expect(renamed).toBeVisible();
  await page.getByRole("button", { name: /^Remove/ }).click();
  await expect(renamed).toHaveCount(0);
});

test("a course poster opens the summary, not the first lesson", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/courses");
  const course = "cccccccc-0000-4000-8000-000000000001";
  await page.locator(`a[href="/courses/${course}"]`).first().click();
  await page.waitForURL(`**/courses/${course}`);
  await expect(page.getByRole("link", { name: /Start the course|Continue/ }).first()).toBeVisible();
});

test("a department card on Training names each level", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  const levels = page.getByRole("list", { name: "Lessons complete in each level" }).first();
  await expect(levels.getByText("Level 1")).toBeVisible();
});

test("on a phone, Courses is on the bottom bar, with Explore a switch inside", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Phones only");
  await signInByEmail(page, "avery.volunteer@example.com");
  const bar = page.getByRole("navigation", { name: "Academy" });
  await bar.getByRole("link", { name: "Courses" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Library" })
    .getByRole("link", { name: "Explore" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Explore" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");

  // All five labels stay inside their own tab on a small phone.
  await page.setViewportSize({ width: 320, height: 640 });
  const crowded = await bar
    .getByRole("link")
    .evaluateAll((links) => links.filter((link) => link.scrollWidth > link.clientWidth).length);
  expect(crowded).toBe(0);
});

test("a volunteer finds courses by search and category", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();

  const search = page.getByLabel("Search courses");
  await search.fill("no course has this title");
  await expect(page.getByText("No courses match")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("No courses match")).toHaveCount(0);
});
