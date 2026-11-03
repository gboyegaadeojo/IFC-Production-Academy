import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Decision 2026-11-03-sop-library: SOPs for all of production, grouped by category.
test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Needs the local Supabase stack");
});

test("a director adds an SOP for all of production in a new category", async ({ page }) => {
  const stamp = Date.now();
  const name = `E2E copyright review ${stamp}`;
  const category = `E2E licensing ${stamp}`;
  await signInByEmail(page, "emery.director@example.com");
  await page.goto("/admin/sops");

  await page.getByRole("button", { name: /Add (your first )?SOP/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add an SOP" });
  await dialog.getByLabel("SOP title").fill(name);
  await dialog.getByLabel("Who it's for").selectOption({ label: "All of production" });
  await dialog.getByLabel("Category").selectOption({ label: "New category…" });
  await dialog.getByLabel("New category name").fill(category);
  await dialog.getByRole("button", { name: "Create SOP" }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("All of production").first()).toBeVisible();

  await page.goto("/admin/sops");
  await expect(page.getByRole("link", { name })).toBeVisible();

  // A category collapses and opens again.
  const heading = page.getByRole("heading", { level: 2 }).filter({ hasText: category });
  await heading.getByRole("button").click();
  await expect(page.getByRole("link", { name })).toBeHidden();
  await heading.getByRole("button").click();
  await expect(page.getByRole("link", { name })).toBeVisible();

  // Search and the category buttons narrow the list.
  await page.getByLabel("Search SOPs").fill(`no such sop ${stamp}`);
  await expect(page.getByRole("heading", { name: "Nothing matches" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("group", { name: "Filter by category" })
    .getByRole("button", { name: new RegExp(category) })
    .click();
  await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByText(/^1 of \d+ SOPs$/)).toBeVisible();
});

test("a department leader can't add an SOP for all of production", async ({ page }) => {
  await signInByEmail(page, "casey.leader@example.com");
  await page.goto("/admin/sops");
  await page.getByRole("button", { name: /Add (your first )?SOP/ }).click();
  const options = page.getByRole("dialog").getByLabel("Who it's for").getByRole("option");
  await expect(options.filter({ hasText: "All of production" })).toHaveCount(0);
});
