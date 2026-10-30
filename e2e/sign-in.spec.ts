import { expect, test } from "@playwright/test";

// These run without a database: they cover what a signed-out visitor sees.

test("a signed-out visitor is sent to sign-in", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in to keep learning" })).toBeVisible();
});

test("the sign-in page offers Google and an email link", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
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

test("a bad code from an email link is reported as a link problem, not Google", async ({
  page,
}) => {
  await page.goto("/auth/callback?code=not-a-real-code&next=/home&via=email");
  await expect(page).toHaveURL(/error=link_invalid/);
});

test("a bad code from Google is reported as a Google problem", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/error=oauth_failed/);
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
