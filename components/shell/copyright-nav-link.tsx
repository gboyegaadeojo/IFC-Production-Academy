import { ShieldIcon } from "@/components/ui/icons";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getMyReviewCount } from "@/lib/data/copyright";
import { AcademyNavLink } from "./academy-nav";

/**
 * Copyright in the side bar, for Academy members with the Copyright reviewer permission
 * (ADD-COPY-05), with how many requests wait for them. The page checks access on the server too.
 */
export async function CopyrightNavLink() {
  const grants = await getMyCapabilities();
  if (!grants.some((grant) => grant.capability === "copyright.review")) {
    return null;
  }
  const waiting = await getMyReviewCount();
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
