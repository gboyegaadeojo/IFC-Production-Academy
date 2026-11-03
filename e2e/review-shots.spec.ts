import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { capture, ensureScreenshotDir, SCREENSHOT_DIR } from "./support/screenshots";

// Temporary, for one app-wide review. Never merged. Fake seed accounts only.

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
    test(`${who} at ${size.name}`, async ({ browser, baseURL }) => {
      test.setTimeout(300_000);
      expect(await mailpitAvailable()).toBe(true);
      const context = await browser.newContext({
        baseURL,
        viewport: { width: size.width, height: size.height },
        hasTouch: size.touch,
        isMobile: size.name === "390",
      });
      const page = await context.newPage();
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          problems.push(`console: ${message.text().slice(0, 140)}`);
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
          problems.length = 0;
          const start = Date.now();
          const response = await page.goto(path);
          await page.waitForLoadState("networkidle").catch(() => undefined);
          const ms = Date.now() - start;
          const sizes = await page.evaluate(() => ({
            wide: document.documentElement.scrollWidth,
            inner: window.innerWidth,
            small: [...document.querySelectorAll("button, a, input, select")].filter((el) => {
              const box = el.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && box.height < 24;
            }).length,
          }));
          const name = `r-${path.replace(/\//g, "_")}-${size.name}${dark ? "-dark" : ""}`;
          await capture(page, name);
          appendFileSync(
            `${SCREENSHOT_DIR}/review-report.txt`,
            `${name} status=${response?.status()} ms=${ms} overflow=${sizes.wide > sizes.inner ? sizes.wide - sizes.inner : 0} under24px=${sizes.small} ${problems.join(" | ")}\n`,
          );
        }
      }
      await context.close();
    });
  }
}
