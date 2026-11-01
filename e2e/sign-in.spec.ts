import { expect, test } from "@playwright/test";

// These run without a database: they cover what a signed-out visitor sees.

test("a signed-out visitor is sent to sign-in", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in to keep learning" })).toBeVisible();
});

test("the sign-in page offers an email link only", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("an invalid email address gets a plain-language error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Enter a valid email address/);
});

test("an expired or reused link explains what happened", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email");
  await expect(page).toHaveURL(/error=link_invalid/);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/expired or was already used/);
});

test("a bad code from an email link explains what happened", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code&next=/home");
  await expect(page).toHaveURL(/error=link_invalid/);
});

test("an unknown error code is ignored rather than shown", async ({ page }) => {
  await page.goto("/sign-in?error=%3Cscript%3E");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("the design token preview is hidden in production builds", async ({ page }) => {
  test.skip(!process.env.CI, "CI runs the production build; local runs use the dev server");
  const response = await page.goto("/dev/tokens");
  expect(response?.status()).toBe(404);
});

test("the Academy is installable: manifest, icons, and theme", async ({ page, request }) => {
  // SPEC §1 and the MVP checklist: responsive and installable as a PWA.
  await page.goto("/sign-in");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await request.get(href ?? "");
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string }[];
  };
  expect(body.name).toBe("IFC Production Academy");
  expect(body.display).toBe("standalone");
  expect(body.start_url).toBe("/home");
  for (const size of ["192x192", "512x512"]) {
    const icon = body.icons.find((i) => i.sizes === size);
    expect(icon, `a ${size} icon`).toBeTruthy();
    const image = await request.get(icon?.src ?? "");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("each device chooses Dark, Light or System, and keeps it", async ({ page }) => {
  // Checklist app US-08a: Dark by default.
  await page.goto("/sign-in");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  const appearance = page.getByRole("group", { name: "Appearance" });
  await expect(appearance.getByRole("radio", { name: "Dark" })).toBeChecked();

  await appearance.getByTitle("Light").click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(appearance.getByRole("radio", { name: "Light" })).toBeChecked();

  // System follows the device, before the first paint and when it changes.
  await page.emulateMedia({ colorScheme: "light" });
  await appearance.getByTitle("System").click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(html).toHaveAttribute("data-appearance", "system");
});

test("Planning Center sign-in fails safely without its setup or state", async ({ page }) => {
  // Checklist app US-01. CI has no Planning Center app, so starting sign-in explains instead.
  await page.goto("/auth/planning-center");
  await expect(page).toHaveURL(/\/sign-in\?error=pco_failed$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Planning Center sign-in didn't work",
  );

  // A callback that didn't start on this browser is refused.
  await page.goto("/auth/planning-center/callback?code=forged&state=" + "x".repeat(43));
  await expect(page).toHaveURL(/\/sign-in\?error=pco_failed$/);

  // Cancelling at Planning Center says so.
  await page.goto("/auth/planning-center/callback?error=access_denied");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("cancelled");
});
