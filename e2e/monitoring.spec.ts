import { expect, test } from "@playwright/test";

// With no keys set, as in CI, nothing goes to Sentry or PostHog (docs/runbooks/monitoring.md).
test("monitoring stays silent until its keys are set", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (request) => {
    if (/sentry|posthog/i.test(new URL(request.url()).hostname)) {
      outside.push(request.url());
    }
  });
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(outside).toEqual([]);
});
