import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// App name and logo (ADD-DASH-04). Needs the local Supabase stack with the fake seed accounts;
// desktop project only. Changes only the short name and icon, and puts them back.

test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a Platform Admin changes the short name and logo, and the installed app is told", async ({
  page,
  request,
}) => {
  // Frankie is the fake seed Platform Administrator.
  await signInByEmail(page, "frankie.admin@example.com");
  await page.goto("/admin/branding");
  await expect(page.getByRole("heading", { level: 1, name: "App name and logo" })).toBeVisible();

  await page.getByLabel("Short name").fill("Fake Team App Long Name");
  await expect(page.getByText(/Phones may cut this off/)).toBeVisible();
  await page.getByLabel("Short name").fill("Fake Team");
  await page.getByRole("button", { name: "Cross" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("Fake Team");
  expect(manifest.icons[0].src).toContain("/storage/v1/object/public/branding/app-icon-");
  const icon = await request.get(manifest.icons[0].src);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/png");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  const restored = await (await request.get("/manifest.webmanifest")).json();
  expect(restored.short_name).toBe("IFC Academy");
  expect(restored.icons[0].src).toBe("/icons/icon-192.png");
});

test("a volunteer can't open it", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/admin/branding");
  await expect(page.getByRole("heading", { name: /isn't open to you/ })).toBeVisible();
});
