import { cache } from "react";
import { ShieldIcon } from "@/components/ui/icons";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getMyReviewCount } from "@/lib/data/copyright";
import { AcademyNavLink, type CopyrightTab } from "./academy-nav";

/**
 * Whether to offer Copyright, and how many wait, once per request: for active Academy members
 * with the Copyright reviewer permission (ADD-COPY-05). The page checks access on the server too.
 */
export const loadCopyrightTab = cache(async (): Promise<CopyrightTab | null> => {
  const user = await getCurrentUser();
  if (user?.status !== "active") {
    return null;
  }
  const grants = await getMyCapabilities();
  if (!grants.some((grant) => grant.capability === "copyright.review")) {
    return null;
  }
  return { waiting: await getMyReviewCount() };
});

/** Copyright in the side bar, with how many requests wait. */
export async function CopyrightNavLink() {
  const copyright = await loadCopyrightTab();
  if (!copyright) {
    return null;
  }
  const { waiting } = copyright;
  return (
    <li>
      <AcademyNavLink
        href="/copyright"
        label="Copyright"
        icon={<ShieldIcon className="size-5" />}
        badge={
          waiting > 0 ? (
            <span className="ml-auto flex min-w-[1.125rem] items-center justify-center rounded-pill bg-accent px-1 text-[0.625rem] font-bold text-on-accent group-data-[folded=true]/sidebar:absolute group-data-[folded=true]/sidebar:top-0 group-data-[folded=true]/sidebar:right-1">
              {waiting}
              <span className="sr-only"> waiting</span>
            </span>
          ) : null
        }
      />
    </li>
  );
}
