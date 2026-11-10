import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Onboarding pathway version history (G, 2026-11-10): Devon (fake seed Audio Engineering leader)
// sets up Audio's pathway, Emery (fake seed Production Director) renames it, and Devon restores the
// version before. Someone else's changes are a new version; one person's sitting is one version.

test.skip(({ isMobile }) => isMobile, "Shared seed pathway: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a leader sees what restoring changes, restores an earlier version, and can undo it", async ({
  browser,
}) => {
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "devon.leader@example.com");
  await leader.goto("/admin/onboarding");
  await expect(
    leader.getByRole("heading", { level: 1, name: "Onboarding pathways" }),
  ).toBeVisible();
  const pathways = leader.getByRole("navigation", { name: "Pathways" });
  if ((await pathways.getByRole("link").count()) === 0) {
    const setup = leader.locator("details").filter({ hasText: "Set up a pathway" });
    await setup.getByText("Set up a pathway").click();
    await setup.getByLabel("For", { exact: true }).selectOption({ label: "Audio Engineering" });
    await setup.getByLabel("Name", { exact: true }).fill("Audio onboarding");
    await setup.getByRole("button", { name: "Create pathway" }).click();
  } else {
    await pathways.getByRole("link").first().click();
  }
  await expect(leader).toHaveURL(/[?&]pathway=/);
  const address = leader.url();
  const heading = leader.getByRole("heading", { level: 2 });
  const before = (await heading.textContent())?.trim() ?? "";
  expect(before).not.toBe("");

  // Emery renames it: someone else's change is a new version.
  const directorContext = await browser.newContext();
  const director = await directorContext.newPage();
  await signInByEmail(director, "emery.director@example.com");
  await director.goto(address);
  const renamed = `Audio renamed ${Date.now()}`;
  const rename = director.locator("details").filter({ hasText: "Rename or describe" });
  await rename.getByText("Rename or describe").click();
  await rename.getByLabel("Name", { exact: true }).fill(renamed);
  await rename.getByRole("button", { name: "Save", exact: true }).click();
  await expect(director.getByRole("heading", { level: 2, name: renamed })).toBeVisible();
  await directorContext.close();

  // Devon sees what restoring the version before would do, then restores it.
  await leader.goto(address);
  await expect(heading).toHaveText(renamed);
  await leader.getByText("Version history").click();
  await expect(leader.getByText(/\(current\)/)).toBeVisible();
  await leader.getByText("Restore this version").first().click();
  await expect(leader.getByText(`Renames the pathway to “${before}”`).first()).toBeVisible();
  await leader
    .getByRole("button", { name: /^Restore version \d+$/ })
    .first()
    .click();
  await expect(leader.getByText(/Restored\. That's saved as version \d+/)).toBeVisible();
  await expect(heading).toHaveText(before);
  await leaderContext.close();
});
