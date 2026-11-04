import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

test("a volunteer can open Videos and Topics", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/videos");
  await expect(page.getByRole("heading", { level: 1, name: "Videos" })).toBeVisible();
  await page.getByLabel("Search videos").fill("no video has this title");
  await expect(page.getByText("No videos match")).toBeVisible();
  await page.goto("/topics");
  await expect(page.getByRole("heading", { level: 1, name: "Topics" })).toBeVisible();
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
