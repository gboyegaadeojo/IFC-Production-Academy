import { expect, type Page } from "@playwright/test";

/** Opens the header account menu (Profile, Admin workspace when permitted, Sign out). */
export async function openAccountMenu(page: Page) {
  const button = page.getByRole("button", { name: /\s*, account menu$/ });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}
