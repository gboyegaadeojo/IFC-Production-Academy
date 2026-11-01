import { expect, test, type Page } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Sign-ups and swaps (decision record 9, stage 3). Needs the local Supabase stack with the fake
// seed accounts; desktop project only, one at a time.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed accounts: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

const ROLE = "Sample role (seed data)";

async function addToTeam(page: Page, label: RegExp) {
  const team = page.getByRole("region", { name: new RegExp(`^${ROLE.replace(/[()]/g, "\\$&")}`) });
  const select = team.getByLabel(`Add to ${ROLE}`);
  if ((await select.count()) === 0) {
    return;
  }
  if (!(await select.isVisible())) {
    await team.getByText("Add someone").click();
  }
  const option = select.locator("option", { hasText: label });
  if ((await option.count()) === 0) {
    return; // Already on the team from an earlier run.
  }
  await select.selectOption({ label: (await option.first().textContent()) ?? "" });
  await team.getByRole("button", { name: "Add", exact: true }).click();
  await expect(team.getByText(/can now be scheduled/)).toBeVisible();
}

test("a volunteer signs up for an open spot, asks for cover, and a teammate takes it", async ({
  browser,
}) => {
  // Three people sign in by email link, one after another.
  test.setTimeout(120_000);
  const service = `Sign-up service ${Date.now()}`;
  const date = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);

  // Emery, the fake Production Director, puts two volunteers on the team and opens sign-ups.
  await test.step("the scheduler sets up the team and the service", async () => {
    const leadContext = await browser.newContext();
    const lead = await leadContext.newPage();
    await signInByEmail(lead, "emery.director@example.com");
    await lead.goto("/admin/teams");
    await lead.getByRole("link", { name: "Camera Operations" }).click();
    await addToTeam(lead, /^Blake/);
    await addToTeam(lead, /^Devon/);
    await lead.goto("/admin/schedule");
    await lead.getByLabel("Name").fill(service);
    await lead.getByLabel("Date").fill(date);
    await lead.getByLabel("Starts").fill("09:00");
    await lead.getByLabel("Ends").fill("11:00");
    await lead.getByRole("button", { name: "Add event" }).click();
    await lead.getByLabel("Role").selectOption({ label: `${ROLE} (Camera Operations)` });
    await lead.getByRole("button", { name: "Add position" }).click();
    await lead.getByRole("button", { name: "Open sign-ups" }).click();
    await expect(lead.getByText(/Sign-ups are open/).first()).toBeVisible();
    await leadContext.close();
  });

  // Blake signs up, then can't make it after all.
  await test.step("a volunteer signs up, then asks for cover", async () => {
    const blakeContext = await browser.newContext();
    const blake = await blakeContext.newPage();
    await signInByEmail(blake, "blake.volunteer@example.com");
    await blake.goto("/schedule");
    await blake
      .getByRole("region", { name: "Open spots" })
      .getByRole("button", { name: `Sign up ${ROLE}, ${service}` })
      .click();
    // The spot leaves Open spots and joins Upcoming assignments; its day shows what to do.
    const upcoming = blake
      .getByRole("region", { name: "Upcoming assignments" })
      .getByRole("link")
      .filter({ hasText: service });
    await expect(upcoming).toHaveCount(1);
    await upcoming.click();
    const mine = blake
      .getByRole("complementary", { name: "Day and upcoming" })
      .locator("article")
      .filter({ hasText: service });
    await mine.getByText("Can't make it? Ask for cover").click();
    await mine.getByLabel("Note (optional)").fill("Away that weekend");
    await mine.getByRole("button", { name: "Ask for cover" }).click();
    await expect(mine.getByText("Cover requested")).toBeVisible();
    await blakeContext.close();
  });

  // Devon, on the same team and free that day, takes it.
  await test.step("a teammate takes it", async () => {
    const devonContext = await browser.newContext();
    const devon = await devonContext.newPage();
    await signInByEmail(devon, "devon.leader@example.com");
    await devon.goto("/schedule");
    const cover = devon.getByRole("region", { name: "Can you cover?" });
    await expect(cover.getByText(/Away that weekend/)).toBeVisible();
    await cover.getByRole("button", { name: `I'll cover it ${ROLE}, ${service}` }).click();
    await expect(
      devon
        .getByRole("region", { name: "Upcoming assignments" })
        .getByText(service, { exact: true }),
    ).toBeVisible();
    await devonContext.close();
  });
});
