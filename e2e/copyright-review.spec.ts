import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Quality control and copyright reviewers (ADD-COPY-04, -05). The private-link pages work with no
// sign-in and open nothing for a made-up link; Copyright in the side bar is only for reviewers.
// The decisions themselves are covered by the database tests (090_copyright_approvals).

test("Quality control and review links that aren't real open nothing", async ({ page }) => {
  for (const path of [
    "/copyright/qc/not-a-real-link",
    "/copyright/qc/not-a-real-link/00000000-0000-4000-8000-000000000000",
    "/copyright/review/not-a-real-link",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "This link isn't working" })).toBeVisible();
  }
});

test("a file link that isn't allowed opens nothing", async ({ request }) => {
  const response = await request.get("/copyright/file?via=review&t=not-a-real-link", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test.describe("signed in", () => {
  test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");
  test.beforeEach(async () => {
    test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
  });

  test("a volunteer has no Copyright in the side bar, and the page says who it's for", async ({
    page,
  }) => {
    await signInByEmail(page, "avery.volunteer@example.com");
    await page.goto("/home");
    await expect(page.getByRole("link", { name: "Copyright" })).toHaveCount(0);
    await page.goto("/copyright");
    await expect(page.getByText("This is for copyright reviewers.")).toBeVisible();
  });

  test("a Platform Admin sets up approvals in Admin, and it starts switched off", async ({
    page,
  }) => {
    await signInByEmail(page, "frankie.admin@example.com");
    await page.goto("/admin/copyright");
    await expect(
      page.getByRole("heading", { level: 1, name: "Video and graphics approvals" }),
    ).toBeVisible();
    await expect(page.getByText("Approvals are off.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quality control" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send me a test" })).toBeVisible();
    await page.goto("/admin/features");
    await expect(page.getByText("Video and graphics approvals").first()).toBeVisible();
  });

  test("a volunteer can't open Admin, Video and graphics approvals", async ({ page }) => {
    await signInByEmail(page, "avery.volunteer@example.com");
    await page.goto("/admin/copyright");
    await expect(page.getByRole("heading", { name: /isn't open to you/ })).toBeVisible();
  });
});
