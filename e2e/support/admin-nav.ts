import type { Locator, Page } from "@playwright/test";

/**
 * A link in the admin sidebar, opening its group first: groups other than the current page's
 * start closed (DESIGN §3.2).
 */
export async function adminNavLink(page: Page, group: string, name: string): Promise<Locator> {
  const nav = page.getByRole("navigation", { name: "Admin" });
  const toggle = nav.getByRole("button", { name: group });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
  return nav.getByRole("link", { name, exact: true });
}
