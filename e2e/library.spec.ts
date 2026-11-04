import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

test("Videos opens on its filters, and lists videos only after a search", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/videos");
  await expect(page.getByRole("heading", { level: 1, name: "Videos" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /\d+ videos?/ })).toHaveCount(0);
  await page.getByLabel("Search videos").fill("no video has this title");
  await expect(page.getByText("No videos match")).toBeVisible();
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
