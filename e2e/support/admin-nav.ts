import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A link in the admin sidebar, opening its group first: groups other than the current page's
 * start closed (DESIGN §3.2). Retries the click until the group opens, in case the page is still
 * hydrating. Matches the start of the name, since a link may carry a count ("2 waiting").
 */
export async function adminNavLink(page: Page, group: string, name: string): Promise<Locator> {
  const nav = page.getByRole("navigation", { name: "Admin" });
  const toggle = nav.getByRole("button", { name: group });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) === "false") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return nav.getByRole("link", { name: new RegExp(`^${escaped}(\\s|$)`) });
}

/** Presses a sidebar toggle until it reports the wanted state (clicks before hydration are lost). */
export async function pressUntil(toggle: Locator, attribute: string, value: string) {
  await expect(async () => {
    if ((await toggle.getAttribute(attribute)) !== value) {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute(attribute, value, { timeout: 1000 });
  }).toPass();
}
