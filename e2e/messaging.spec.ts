import { devices, expect, test, type Page } from "@playwright/test";
import { mailpitAvailable, signInByEmail } from "./support/email-sign-in";

test.beforeEach(async () => {
  test.skip(!(await mailpitAvailable()), "Local Supabase is not running");
});

// One shared switch, so these run in order, on the desktop project only. The first switches
// messaging off and on again (ADD-FLAG-01) and leaves it on for the rest (ADD-MSG-01 to 03, 07).
test.describe.configure({ mode: "serial" });

async function openChat(page: Page, name: string) {
  await page.goto("/messages");
  await page
    .getByRole("link", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("a platform admin switches Messages off and on, and it's audited", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "One shared switch: desktop project only");
  test.setTimeout(90_000);
  await signInByEmail(page, "frankie.admin@example.com");
  await page.goto("/admin/features");
  const messages = page.getByRole("switch", { name: "Messages" });
  if ((await messages.getAttribute("aria-checked")) === "false") {
    await messages.click();
    await expect(messages).toHaveAttribute("aria-checked", "true");
  }
  await messages.click();
  await expect(messages).toHaveAttribute("aria-checked", "false");
  await messages.click();
  await expect(messages).toHaveAttribute("aria-checked", "true");

  await page.goto("/admin/audit");
  await expect(page.getByText("Switched Messages on").first()).toBeVisible();
  await expect(page.getByText("Switched Messages off").first()).toBeVisible();
});

test("a volunteer can't open Features", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "Desktop project only");
  await signInByEmail(page, `e2e-features-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.goto("/admin/features");
  await expect(page.getByRole("switch", { name: "Messages" })).toHaveCount(0);
});

test("a department chat updates live, and a leader deletes a message", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Shared seed accounts: desktop project only");
  test.setTimeout(150_000);
  const stamp = Date.now();

  // Avery is a fake Camera Operations member; Casey leads Camera Operations.
  await signInByEmail(page, "avery.volunteer@example.com");
  await openChat(page, "Camera Operations");
  await page.getByLabel("Message", { exact: true }).fill(`Fake: camera 2 check ${stamp}`);
  await page.getByRole("button", { name: "Send" }).click();
  const log = page.getByRole("log");
  await expect(log.getByText(`Fake: camera 2 check ${stamp}`)).toBeVisible();

  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "casey.leader@example.com");
  await openChat(leader, "Camera Operations");
  await expect(leader.getByRole("log").getByText(`Fake: camera 2 check ${stamp}`)).toBeVisible();
  await leader.getByLabel("Message", { exact: true }).fill(`Fake: yes, long lens ${stamp}`);
  await leader.getByRole("button", { name: "Send" }).click();

  // It arrives in Avery's open chat without a refresh: live, or by the 15-second check.
  await expect(log.getByText(`Fake: yes, long lens ${stamp}`)).toBeVisible({ timeout: 20_000 });
  // How it arrived, for the CI log: "live" means Realtime delivered it.
  const live = await page.locator("section[data-live]").getAttribute("data-live");
  console.log(`Messaging live status in CI: ${live ?? "unknown"}`);

  // The leader deletes Avery's message, and Avery sees why it's gone.
  await leader
    .getByRole("log")
    .getByText(`Fake: camera 2 check ${stamp}`)
    .locator("xpath=ancestor::div[contains(@class,'group')][1]")
    .getByRole("button", { name: /^Actions for/ })
    .click();
  await leader.getByRole("button", { name: "Delete message" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(leader.getByRole("log").getByText(`Fake: camera 2 check ${stamp}`)).toHaveCount(0);
  await expect(log.getByText(`Fake: camera 2 check ${stamp}`)).toHaveCount(0, { timeout: 20_000 });
  await expect(log.getByText("Message deleted by a leader").first()).toBeVisible();
  await leaderContext.close();
});

test("a direct message is private, and a leader makes an everyone chat", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Shared seed accounts: desktop project only");
  test.setTimeout(120_000);
  const stamp = Date.now();

  await signInByEmail(page, "avery.volunteer@example.com");
  await page.goto("/messages/new");
  await expect(page.getByRole("link", { name: /New group chat/ })).toHaveCount(0);
  await page.getByLabel("Find a person").fill("Blake");
  await page.getByRole("button", { name: /Blake Example/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Blake Example" })).toBeVisible();
  // Private between the two (G, 2026-11-09): no notice that anyone else reads it.
  await expect(page.getByText(/can read direct messages/)).toHaveCount(0);
  await page.getByLabel("Message", { exact: true }).fill(`Fake: can you swap ${stamp}?`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log").getByText(`Fake: can you swap ${stamp}?`)).toBeVisible();

  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInByEmail(leader, "casey.leader@example.com");
  await leader.goto("/messages/new-group");
  await leader.getByLabel("Name").fill(`Fake everyone ${stamp}`);
  await leader.getByRole("button", { name: /Make the group/ }).click();
  await expect(
    leader.getByRole("heading", { level: 1, name: `Fake everyone ${stamp}` }),
  ).toBeVisible();
  // Who's in it: everyone in the Academy, so nobody is added or removed by hand.
  await leader.getByRole("button", { name: "Chat settings" }).click();
  await leader.getByRole("button", { name: /People in this chat/ }).click();
  const people = leader.getByRole("dialog", { name: "People in this chat" });
  await expect(
    people.getByText("Everyone in the Academy. New people join automatically."),
  ).toBeVisible();
  await expect(people.getByText("Casey Example")).toBeVisible();
  await expect(people.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await leaderContext.close();

  // Everyone can read it.
  await page.goto("/messages");
  await expect(
    page.getByRole("link", { name: new RegExp(`Fake everyone ${stamp}`) }),
  ).toBeVisible();
});

/** A small blue picture drawn in the page, so a photo can be picked without a real one. */
async function fakePhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#4f8cff";
      context.fillRect(0, 0, 80, 60);
    }
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  return Buffer.from(base64, "base64");
}

test("photos and documents are shared, and GIFs say when they aren't set up", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Shared seed accounts: desktop project only");
  test.setTimeout(120_000);
  const stamp = Date.now();
  await signInByEmail(page, "avery.volunteer@example.com");
  await openChat(page, "Camera Operations");
  const log = page.getByRole("log");

  // A photo: made smaller in the browser, uploaded, then sent with words.
  await page.getByLabel("Add photos").setInputFiles({
    name: "fake-riser.png",
    mimeType: "image/png",
    buffer: await fakePhoto(page),
  });
  await expect(page.getByText(/^Ready · /)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Message", { exact: true }).fill(`Fake: riser photo ${stamp}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log.getByText(`Fake: riser photo ${stamp}`)).toBeVisible();
  await expect(log.getByRole("button", { name: "Open photo 1 of 1" }).last()).toBeVisible();

  // The full photo opens on its own, and closes again.
  await log.getByRole("button", { name: "Open photo 1 of 1" }).last().click();
  await expect(page.getByRole("dialog", { name: "Photo 1 of 1" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // A document: checked by its name and first bytes, then shared on its own.
  await page.getByLabel("Add a document").setInputFiles({
    name: `Fake run sheet ${stamp}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Fake run sheet for tests\n%%EOF\n"),
  });
  await expect(page.getByText(/^Ready · /)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log.getByText(`Fake run sheet ${stamp}.pdf`)).toBeVisible();

  // A program renamed to .pdf is refused before it's uploaded.
  await page.getByLabel("Add a document").setInputFiles({
    name: "not-really.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("MZ fake program"),
  });
  await expect(
    page.getByText("That file isn't what its name says, so it can't be shared."),
  ).toBeVisible();

  // GIFs need the GIPHY key, which tests don't have.
  await page.getByRole("button", { name: "Add a photo, GIF or document" }).click();
  await page.getByRole("button", { name: /^GIF/ }).click();
  await expect(page.getByText(/GIFs aren't set up yet/)).toBeVisible();
});

test("on a phone, Messages sits in the middle of the tabs, and Serve holds the checklist", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Runs once, from the desktop project, with a phone-sized window");
  test.setTimeout(90_000);
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await phone.newPage();
  await signInByEmail(page, "blake.volunteer@example.com");
  await page.goto("/messages");
  const tabs = page.getByRole("navigation", { name: "Academy" }).filter({ visible: true });
  // What a screen reader hears. An unread count comes after the name: "Messages, 1 unread".
  const links = tabs.getByRole("link");
  await expect(links).toHaveCount(5);
  const names = ["Training", "Courses", /^Messages\s*(, \d+ unread)?$/, "Schedule", "Serve"];
  for (const [index, name] of names.entries()) {
    await expect(links.nth(index)).toHaveAccessibleName(name);
  }
  await expect(tabs.getByRole("link", { name: "Messages" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await phone.close();
});
