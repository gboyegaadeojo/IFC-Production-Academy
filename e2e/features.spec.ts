import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// ADD-FLAG-01: Platform Admins switch modules on and off, and each change is audited.
test("a platform admin switches a feature on and off", async ({ page, isMobile }) => {
  test.skip(isMobile, "One shared switch: desktop project only");
  test.setTimeout(90_000);
  await signInByEmail(page, "frankie.admin@example.com");
  await page.goto("/admin/features");
  await expect(page.getByRole("heading", { level: 1, name: "Features" })).toBeVisible();

  const messages = page.getByRole("switch", { name: "Messages" });
  await expect(messages).toHaveAttribute("aria-checked", "false");
  await messages.click();
  await expect(messages).toHaveAttribute("aria-checked", "true");
  await messages.click();
  await expect(messages).toHaveAttribute("aria-checked", "false");

  await page.goto("/admin/audit");
  await expect(page.getByText("Switched Messages on").first()).toBeVisible();
  await expect(page.getByText("Switched Messages off").first()).toBeVisible();
});

test("a volunteer can't open Features", async ({ page }, testInfo) => {
  await signInByEmail(page, `e2e-features-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.goto("/admin/features");
  await expect(page.getByRole("switch", { name: "Messages" })).toHaveCount(0);
});
