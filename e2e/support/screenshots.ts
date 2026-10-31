import { mkdirSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

// Design review screenshots (DESIGN-REQUIREMENTS §12–14). CI uploads SCREENSHOT_DIR as an artifact.
// Only fake seed data and generated example.com accounts appear in them.

export const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? "test-results/screenshots";

export const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export function ensureScreenshotDir() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(0);
}

/** Checks for sideways scrolling, then saves a full-page screenshot. */
export async function capture(page: Page, name: string) {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}
