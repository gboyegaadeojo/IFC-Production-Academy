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

  // The chosen logo replaces the built-in Signal Line mark in the app, not just on the phone.
  await page.goto("/admin");
  await expect(
    page.locator('img[src*="/storage/v1/object/public/branding/app-icon-"]').first(),
  ).toBeVisible();
  await expect(page.locator("svg[data-logo]")).toHaveCount(0);
  await page.goto("/admin/branding");

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("Fake Team");
  expect(manifest.icons[0].src).toContain("/storage/v1/object/public/branding/app-icon-");
  const icon = await request.get(manifest.icons[0].src);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/png");

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  const restored = await (await request.get("/manifest.webmanifest")).json();
  expect(restored.short_name).toBe("IFC Academy");
  expect(restored.icons[0].src).toBe("/icons/icon-192.png");
});

test("a Platform Admin changes the system colour, sees it everywhere, and puts purple back", async ({
  page,
  request,
}) => {
  await signInByEmail(page, "frankie.admin@example.com");
  await page.goto("/admin/branding");
  const panel = page.getByRole("region", { name: "System colour" });
  await expect(panel.getByRole("radio", { name: "Purple" })).toBeChecked();
  // Purple is the stylesheet's own, so nothing is added to the page.
  await expect(page.locator("style#system-colour")).toHaveCount(0);

  // Custom: a colour too light for white text is deepened, and the page says so.
  await panel.getByRole("radio", { name: "Custom" }).check();
  await panel.getByLabel("Your colour (hex)").fill("#F59E0B");
  await expect(panel.getByText(/uses a deeper shade of it/)).toBeVisible();

  await panel.getByRole("radio", { name: "Teal" }).check();
  await expect(panel.getByRole("img", { name: "Light theme with this colour" })).toBeVisible();
  // The colour is for everyone, and other tests check the logo's purple dot at the same time,
  // so the dot keeps its purple here.
  await panel.getByRole("checkbox", { name: "The logo's dot uses it too" }).uncheck();
  try {
    await panel.getByRole("button", { name: "Save colour" }).click();
    await expect(panel.getByText(/^Saved\. Everyone sees/)).toBeVisible();

    await page.goto("/home");
    const style = page.locator("style#system-colour");
    await expect.poll(() => style.textContent()).toContain("--accent:#0f766e");
    expect(await style.textContent()).not.toContain("--logo-accent");
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.theme_color).toBe("#0f766e");

    await page.goto("/admin/branding");
    await expect(panel.getByRole("radio", { name: "Teal" })).toBeChecked();
  } finally {
    // Purple back, even if a check above failed, so no other test sees Teal.
    await page.goto("/admin/branding");
    await panel.getByRole("button", { name: "Reset colour" }).click();
    await panel.getByRole("button", { name: "Save colour" }).click();
    await expect(panel.getByText(/^Saved\. Everyone sees/)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator("style#system-colour")).toHaveCount(0);
});

test("a volunteer can't open it", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/admin/branding");
  await expect(page.getByRole("heading", { name: /isn't open to you/ })).toBeVisible();
});
