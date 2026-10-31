import { expect, type Page } from "@playwright/test";

// Email-link sign-in against the local Supabase stack; Mailpit catches the email.

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitSearch = { messages: { ID: string }[] };
type MailpitMessage = { HTML: string };

export async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/info`);
    return response.ok;
  } catch {
    return false;
  }
}

/** The newest sign-in link sent to an address. */
export async function signInLinkFor(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = (await (
          await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
        ).json()) as MailpitSearch;
        const id = search.messages[0]?.ID;
        if (!id) {
          return undefined;
        }
        const message = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
        ).json()) as MailpitMessage;
        link = /href="([^"]*\/auth\/confirm[^"]*)"/
          .exec(message.HTML)?.[1]
          ?.replaceAll("&amp;", "&");
        return link;
      },
      { message: "waiting for the sign-in email", timeout: 15_000 },
    )
    .toBeTruthy();
  return link as string;
}

/** Clears earlier emails to an address, so a reused fake account never picks up an old link. */
export async function clearMailFor(email: string): Promise<void> {
  const query = encodeURIComponent(`to:"${email}"`);
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, { method: "DELETE" });
}

export async function signInByEmail(page: Page, email: string) {
  await clearMailFor(email);
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  const sent = page.getByRole("heading", { name: "Check your email" });
  const problem = page.getByRole("main").getByRole("alert");
  // Local Supabase sends at most one link per address per second (supabase/config.toml), and
  // seeded accounts sign in from several tests, so a refused send is retried briefly.
  for (let attempt = 1; ; attempt += 1) {
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(sent.or(problem)).toBeVisible();
    if (!(await problem.isVisible())) {
      break;
    }
    if (attempt === 3) {
      // Surface the app's message instead of a bare timeout.
      throw new Error(`Sign-in for ${email} failed: ${await problem.innerText()}`);
    }
    await page.waitForTimeout(2_000);
  }
  await page.goto(await signInLinkFor(email));
  await expect(page).toHaveURL(/\/home$/);
}
