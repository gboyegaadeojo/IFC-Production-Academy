import { expect, test } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

// Onboarding pathways (docs/decisions/2026-11-01-onboarding-pathways.md): a Production Director
// builds "Join the team", adds someone from the lobby, and sees the follow-up and the history.
// Emery is the fake seed Production Director. Desktop only: the general pathway is shared.

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Shared seed pathway: desktop project only");

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running (npm run db:start)");
});

test("a director builds Join the team, adds someone, and sees their follow-up", async ({
  page,
}) => {
  const stamp = Date.now();
  const person = `Lobby Example ${stamp}`;
  await signInByEmail(page, "emery.director@example.com");
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { level: 1, name: "Onboarding pathways" })).toBeVisible();

  const pathways = page.getByRole("navigation", { name: "Pathways" });
  if ((await pathways.getByRole("link", { name: /^Join the team/ }).count()) === 0) {
    await page.getByText("Set up a pathway").click();
    await page
      .getByLabel("For")
      .selectOption({ label: "Everyone joining the team (Join the team)" });
    await page.getByLabel("Name", { exact: true }).fill("Join the team");
    await page.getByRole("button", { name: "Create pathway" }).click();
  } else {
    await pathways.getByRole("link", { name: /^Join the team/ }).click();
  }
  await expect(page.getByRole("heading", { level: 2, name: "Join the team" })).toBeVisible();

  // Add a follow-up from the library; its settings open beside the pathway.
  const library = page.getByRole("complementary", { name: "Step library" });
  await library.getByRole("button", { name: "Add Follow-up task" }).click();
  const settings = page.getByRole("region", { name: "Follow-up task" });
  await expect(settings).toBeVisible();
  await settings.getByLabel("From").selectOption({ label: "Production Director" });
  await expect(settings.getByRole("radio", { name: /Take turns/ })).toBeChecked();
  await settings.getByRole("button", { name: "Save step" }).click();
  await expect(settings.getByText("Saved.")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Pathway steps" })
      .getByText(/taking turns/)
      .first(),
  ).toBeVisible();

  // Someone from the lobby.
  await page.goto("/admin/onboarding/people");
  await page.getByText("Add someone").click();
  await page.getByLabel("Pathway").selectOption({ label: "Join the team" });
  await page.getByLabel("Their name").fill(person);
  await page.getByLabel("Their email").fill(`lobby-${stamp}@example.com`);
  await page.getByRole("button", { name: "Add to pathway" }).click();
  await expect(page.getByText(`${person} is in.`)).toBeVisible();

  // Their follow-up waits for a director, and their history says how they came in.
  await page.goto("/admin/onboarding/follow-ups");
  await expect(page.getByText(new RegExp(`· ${person}$`)).first()).toBeVisible();
  await page.goto("/admin/onboarding/people");
  await page.getByRole("link", { name: new RegExp(person) }).click();
  const detail = page.getByRole("region", { name: person });
  await expect(detail.getByText("Came in through a leader adding them")).toBeVisible();
  await expect(detail.getByText(/Follow-up created/).first()).toBeVisible();

  // A private note is marked as private.
  await detail.getByLabel("Add a note").fill("Fake note: keen on cameras.");
  await detail.getByLabel("Private, only me").check();
  await detail.getByRole("button", { name: "Save note" }).click();
  await expect(detail.getByText(/private, only you/)).toBeVisible();
});
