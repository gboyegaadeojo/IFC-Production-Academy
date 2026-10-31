import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/app/auth/actions";
import { Wordmark } from "@/components/brand";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { adminSections } from "@/lib/domain/admin";
import { initials } from "@/lib/domain/people";
import { AccountMenu } from "./account-menu";
import { AcademyNav } from "./academy-nav";

/** Compact top bar shared by the Academy and Admin workspaces (DESIGN §3). */
export function AcademyHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="page-container flex min-h-14 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link
            href="/home"
            className="flex min-h-touch items-center rounded-button"
            aria-label="IFC Production Academy, home"
          >
            <Wordmark />
          </Link>
          <AcademyNav />
        </div>
        <Suspense fallback={<div className="size-8 rounded-pill bg-card" aria-hidden="true" />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}

async function Account() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  // Only areas a person may use are offered (SPEC §8); each admin page checks again on the server.
  const showAdmin = user.status === "active" && adminSections(await getMyCapabilities()).length > 0;
  return (
    <AccountMenu
      displayName={user.displayName}
      initials={initials(user.displayName)}
      showAdmin={showAdmin}
      signOut={signOutAction}
    />
  );
}
