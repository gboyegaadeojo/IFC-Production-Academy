import { expect, type Page, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";
import { capture, ensureScreenshotDir } from "./support/screenshots";

// The Signal Line logo (decision 2026-11-10, ADD-DASH-04): drawn inline with an accessible name and
// a fixed size, in the right colours for light and dark. Saves screenshots for review in
// test-results/screenshots (CI uploads them).

const NAME = "IFC Production Academy";
const THEMES = [
  { theme: "light", ink: "rgb(0, 0, 0)", accent: "rgb(124, 58, 237)" },
  { theme: "dark", ink: "rgb(245, 245, 245)", accent: "rgb(182, 155, 255)" },
] as const;

async function useTheme(page: Page, theme: "light" | "dark") {
  const { baseURL } = test.info().project.use;
  await page.context().addCookies([{ name: "appearance", value: theme, url: baseURL ?? "" }]);
}

/** The visible logo: its variant, size attributes, and the colours it's drawn in. */
async function readLogo(page: Page) {
  const logo = page.getByRole("img", { name: NAME }).filter({ visible: true }).first();
  await expect(logo).toBeVisible();
  return logo.evaluate((svg) => ({
    tag: svg.tagName.toLowerCase(),
    variant: svg.getAttribute("data-logo"),
    width: Number(svg.getAttribute("width")),
    height: Number(svg.getAttribute("height")),
    ink: getComputedStyle(svg).color,
    accent: getComputedStyle(svg.querySelector("circle") as Element).fill,
  }));
}

test.beforeAll(() => ensureScreenshotDir());

for (const { theme, ink, accent } of THEMES) {
  test(`sign-in shows the full logo in ${theme}`, async ({ page }, info) => {
    await useTheme(page, theme);
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const logo = await readLogo(page);
    expect(logo).toMatchObject({ tag: "svg", variant: "horizontal", height: 52, ink, accent });
    // 366 by 104, scaled: a fixed size, so nothing shifts as the page loads.
    expect(logo.width).toBe(183);
    await capture(page, `brand-sign-in-${theme}-${info.project.name}`);
  });
}

test.describe("signed in", () => {
  test.beforeEach(async () => {
    test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
  });

  for (const { theme, ink, accent } of THEMES) {
    test(`the side bar or phone top bar shows the mark in ${theme}`, async ({ page }, info) => {
      await signInByEmail(page, "avery.volunteer@example.com");
      await useTheme(page, theme);
      await page.goto("/home");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const logo = await readLogo(page);
      expect(logo).toMatchObject({
        tag: "svg",
        variant: "mark",
        width: 30,
        height: 30,
        ink,
        accent,
      });
      // It leads to Training, and says so.
      await expect(
        page.getByRole("link", { name: `${NAME} Training` }).filter({ visible: true }),
      ).toHaveAttribute("href", "/home");
      await capture(page, `brand-header-${theme}-${info.project.name}`);
    });
  }
});

test("the favicons, Apple icon and manifest icons are the Signal Line files", async ({
  page,
  request,
}) => {
  await page.goto("/sign-in");
  await expect(page.locator('link[rel="icon"][href="/icon.svg"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);

  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect((await ico.body()).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));

  const svg = await request.get("/icon.svg");
  expect(await svg.text()).toContain("prefers-color-scheme:dark");

  const apple = await request.get("/icons/apple-touch-icon.png");
  expect(apple.headers()["content-type"]).toContain("image/png");

  const manifest = (await (await request.get("/manifest.webmanifest")).json()) as {
    theme_color: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest.theme_color).toBe("#7c3aed");
  const maskable = manifest.icons.filter((icon) => icon.purpose === "maskable");
  expect(maskable.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});
