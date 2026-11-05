import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { capture, ensureScreenshotDir, SCREENSHOT_DIR } from "./support/screenshots";

// Every screen at phone, tablet, and web size, plus dark mode for a sample (app review, item 19).
// Pages must load without console errors or sideways page scrolling. Fake seed accounts only.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Sizes are set explicitly; runs once, in desktop");

const LEARNER = [
  "/home",
  "/sops",
  "/serve",
  "/schedule",
  "/notifications",
  "/profile",
  "/get-the-app",
  "/mentoring",
  "/help",
];
const ADMIN = [
  "/admin",
  "/admin/checklists",
  "/admin/checklists/activity",
  "/admin/checklists/history",
  "/admin/checklists/settings",
  "/admin/sops",
  "/admin/assessments",
  "/admin/competencies",
  "/admin/mentoring",
  "/admin/reports",
  "/admin/teams",
  "/admin/schedule",
  "/admin/schedule/types",
  "/admin/planning-center",
  "/admin/onboarding",
  "/admin/onboarding/people",
  "/admin/onboarding/follow-ups",
  "/admin/people",
  "/admin/alerts",
];
const DARK = new Set([
  "/home",
  "/sops",
  "/profile",
  "/admin",
  "/admin/sops",
  "/admin/people",
  "/admin/reports",
]);
const SIZES = [
  { name: "390", width: 390, height: 844, touch: true },
  { name: "768", width: 768, height: 1024, touch: true },
  { name: "1440", width: 1440, height: 900, touch: false },
];

test.beforeAll(() => {
  ensureScreenshotDir();
});

for (const size of SIZES) {
  for (const [who, email, paths] of [
    ["learner", "avery.volunteer@example.com", LEARNER],
    ["admin", "emery.director@example.com", ADMIN],
  ] as const) {
    test(`${who} screens at ${size.name}px`, async ({ browser, baseURL }) => {
      test.setTimeout(300_000);
      test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
      const context = await browser.newContext({
        baseURL,
        viewport: { width: size.width, height: size.height },
        hasTouch: size.touch,
        isMobile: size.name === "390",
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text().slice(0, 140));
        }
      });
      await signInByEmail(page, email);
      for (const dark of [false, true]) {
        for (const path of paths) {
          if (dark && !DARK.has(path)) {
            continue;
          }
          await context.addCookies([
            { name: "appearance", value: dark ? "dark" : "light", url: baseURL ?? "" },
          ]);
          const response = await page.goto(path);
          expect(response?.status(), path).toBe(200);
          await page.waitForLoadState("networkidle").catch(() => undefined);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
          const name = `all${path.replace(/\//g, "_")}-${size.name}${dark ? "-dark" : ""}`;
          await capture(page, name);
          appendFileSync(`${SCREENSHOT_DIR}/all-screens.txt`, `${name} errors=${errors.length}\n`);
        }
      }
      expect(errors).toEqual([]);
      await context.close();
    });
  }
}
