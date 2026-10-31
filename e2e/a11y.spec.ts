import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openAccountMenu } from "./support/account-menu";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Accessibility checks (DESIGN-REQUIREMENTS Milestone E, §9, §12; SPEC §6): axe against WCAG
// 2.0/2.1/2.2 A and AA on every main page and state, plus keyboard and reduced-motion checks.
// Fails on serious or critical violations. Fake seed data only.

const SAMPLE_COURSE = "cccccccc-0000-4000-8000-000000000001";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Runs once, in the desktop project");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

async function expectAccessible(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  const summary = serious.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help} → ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary, `Accessibility problems on ${name}`).toEqual([]);
}

test("signed-out pages are accessible", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to keep learning" })).toBeVisible();
  await expectAccessible(page, "sign-in");

  // The skip link is the first thing a keyboard reaches.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("learner pages are accessible and keyboard friendly", async ({ page }) => {
  await signInByEmail(page, "avery.volunteer@example.com");
  await expectAccessible(page, "home (member)");

  // Account menu by keyboard: opens with Enter, closes with Escape, focus returns.
  const account = page.getByRole("button", { name: /^Account: / });
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
  await expectAccessible(page, "account menu open");
  await page.keyboard.press("Escape");
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(account).toBeFocused();

  await page.goto("/departments/camera-operations");
  await expect(page.getByRole("heading", { level: 1, name: "Camera Operations" })).toBeVisible();
  await expectAccessible(page, "department (member)");

  await page.goto(`/courses/${SAMPLE_COURSE}`);
  await expectAccessible(page, "course (member)");

  await page.getByRole("link", { name: "Start the course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sample lesson" })).toBeVisible();
  await expectAccessible(page, "lesson");

  await openAccountMenu(page);
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();
  await expectAccessible(page, "profile");
});

test("a new volunteer's pages are accessible", async ({ page }) => {
  await signInByEmail(page, `a11y-new-${Date.now()}@example.com`);
  await expectAccessible(page, "home (new)");
  await page.goto("/departments/audio-engineering");
  await expectAccessible(page, "department (visitor)");
  await page.goto(`/courses/${SAMPLE_COURSE}`);
  await expectAccessible(page, "course (locked)");
});

test("admin pages are accessible", async ({ page }) => {
  await signInByEmail(page, "emery.director@example.com");
  for (const [path, name] of [
    ["/admin", "dashboard"],
    ["/admin/members", "membership requests"],
    ["/admin/members?view=members", "members"],
    ["/admin/invitations", "invitations"],
    ["/admin/curriculum", "curriculum"],
    [`/admin/curriculum/${SAMPLE_COURSE}`, "course editor: lessons"],
    [`/admin/curriculum/${SAMPLE_COURSE}?tab=details`, "course editor: details"],
    [`/admin/curriculum/${SAMPLE_COURSE}?tab=publish`, "course editor: publish"],
    [`/admin/curriculum/${SAMPLE_COURSE}?tab=history`, "course editor: history"],
    ["/admin/people", "people"],
    ["/admin/audit", "audit log"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page, name);
  }
  await page.goto("/admin/people");
  await page.getByRole("link", { name: /Avery Example/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Avery Example" })).toBeVisible();
  await expectAccessible(page, "person");
});

test("department settings are accessible, including the edit drawer", async ({ page }) => {
  await signInByEmail(page, "frankie.admin@example.com");
  await page.goto("/admin/departments");
  await expectAccessible(page, "departments");
  await page.getByRole("button", { name: "Edit Camera Operations" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit Camera Operations" });
  await expect(drawer).toHaveCSS("opacity", "1");
  await expectAccessible(page, "department edit drawer");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit Camera Operations" })).toBeFocused();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("transitions are switched off", async ({ page }) => {
    await page.goto("/sign-in");
    const duration = await page
      .getByRole("button", { name: "Email me a sign-in link" })
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(duration.split(",").every((value) => Number.parseFloat(value) === 0)).toBe(true);
  });
});
