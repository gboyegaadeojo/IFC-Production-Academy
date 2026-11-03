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

test("an SOP written in the app, with no file, reaches volunteers", async ({ page, browser }) => {
  const name = `E2E written SOP ${Date.now()}`;
  await signInByEmail(page, "emery.director@example.com");
  await page.goto("/admin/sops");
  await page.getByRole("button", { name: /Add (your first )?SOP/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add an SOP" });
  await dialog.getByLabel("SOP title").fill(name);
  await dialog.getByLabel("Who it's for").selectOption({ label: "All of production" });
  await dialog.getByRole("button", { name: "Create SOP" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(name);

  // It can't be published until it has steps or a file.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = page.getByRole("dialog", { name: "Publish this SOP" });
  await expect(publish.getByRole("button", { name: "Publish" })).toBeDisabled();
  await publish.getByRole("button", { name: "Keep editing" }).click();

  await page.getByLabel("The procedure").fill("## Steps\n1. Fake first step\n! Fake warning");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Fake first step" })).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await publish.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Current · Version 1")).toBeVisible();

  const volunteerContext = await browser.newContext();
  const volunteer = await volunteerContext.newPage();
  await signInByEmail(volunteer, "avery.volunteer@example.com");
  await volunteer.goto("/sops");
  await volunteer.getByLabel("Search SOPs").fill(name);
  await volunteer.getByRole("link", { name }).click();
  await expect(volunteer.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(volunteer.getByRole("heading", { name: "Steps" })).toBeVisible();
  await expect(volunteer.getByText("Fake first step")).toBeVisible();
  await expect(volunteer.getByText("Fake warning")).toBeVisible();
  await expect(volunteer.getByRole("link", { name: /^Open the/ })).toHaveCount(0);
  await volunteerContext.close();
});

test("a director archives an SOP, then deletes it for good", async ({ page }) => {
  const name = `E2E delete me ${Date.now()}`;
  await signInByEmail(page, "emery.director@example.com");
  await page.goto("/admin/sops");
  await page.getByRole("button", { name: /Add (your first )?SOP/ }).click();
  await page.getByRole("dialog", { name: "Add an SOP" }).getByLabel("SOP title").fill(name);
  await page
    .getByRole("dialog", { name: "Add an SOP" })
    .getByRole("button", { name: "Create SOP" })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(name);

  // Not until it's archived.
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archive SOP" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete forever" }).click();

  await expect(page).toHaveURL(/\/admin\/sops$/);
  await page.getByLabel("Status").selectOption({ label: "Archived" });
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});
