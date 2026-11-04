import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

test("a volunteer finds courses by search and category", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1, name: "All courses" })).toBeVisible();

  const search = page.getByLabel("Search courses");
  await search.fill("no course has this title");
  await expect(page.getByRole("heading", { name: "No courses match" })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("heading", { name: "No courses match" })).toHaveCount(0);
});
