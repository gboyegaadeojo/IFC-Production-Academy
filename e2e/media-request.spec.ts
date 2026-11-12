import { expect, test } from "@playwright/test";

// The public video and graphics request page (ADD-COPY-01, -03). Signed out. Approvals start
// switched off, so the form says requests are paused; the full request flow is covered once the
// switch is in Admin → Features (PR 4), and by the database tests (090_copyright_approvals).

test("the request page works signed out and says requests are paused while it's off", async ({
  page,
}) => {
  await page.goto("/media-request");
  await expect(page).toHaveURL(/\/media-request$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ask to show a video or graphic" }),
  ).toBeVisible();
  await expect(page.getByText("Requests are paused right now")).toBeVisible();
});

test("a status link that isn't real opens nothing", async ({ page }) => {
  await page.goto("/media-request/status/not-a-real-link");
  await expect(
    page.getByRole("heading", { name: "This link doesn't open a request" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Send a request" })).toHaveAttribute(
    "href",
    "/media-request",
  );
});
