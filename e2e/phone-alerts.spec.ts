import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// Decision 2026-11-05: leaders see who has alerts on, and only they can see it.
test("a leader sees who has phone alerts on", async ({ page, isMobile }) => {
  test.skip(isMobile, "Shared seed accounts: desktop project only");
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/alerts");
  await expect(page.getByRole("heading", { level: 1, name: "Phone alerts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /alerts on a phone$/ })).toBeVisible();
  await expect(page.getByText("Not on").first()).toBeVisible();
});

test("a volunteer can't open the list", async ({ page }, testInfo) => {
  await signInByEmail(page, `e2e-alerts-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.goto("/admin/alerts");
  await expect(page.getByRole("heading", { level: 1, name: "Phone alerts" })).toHaveCount(0);
});

// Only touch screens are asked, and "Not now" holds until the app is next opened.
test("someone on a team is asked to set up alerts on their phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The request only shows on phones");
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/home");
  const ask = page.getByRole("complementary", { name: "Phone alerts" });
  await expect(ask.getByRole("link", { name: "Set up alerts" })).toHaveAttribute(
    "href",
    "/get-the-app",
  );
  await ask.getByRole("button", { name: "Not now" }).click();
  await expect(ask).toHaveCount(0);
  await page.goto("/sops");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(ask).toHaveCount(0);
});
