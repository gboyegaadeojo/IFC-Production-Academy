import Link from "next/link";
import { cache, Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { getAppearance } from "@/lib/data/appearance";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getUnreadCount } from "@/lib/data/notifications";
import { getMyPlanningCenter } from "@/lib/data/profile";
import { adminSections } from "@/lib/domain/admin";
import { initials } from "@/lib/domain/people";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "./account-menu";
import { AcademyNav } from "./academy-nav";
import { ServiceDashboardNavLink } from "./service-dashboard-nav-link";

/** Slim bar on phones, with the brand and account. The tab bar has the links (DESIGN §3). */
export function AcademyHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)] md:hidden print:hidden">
      <div className="page-container flex min-h-14 items-center justify-between gap-3">
        <Link href="/home" className="flex min-h-touch items-center rounded-button">
          <Wordmark />
        </Link>
        <Suspense fallback={<div className="size-8 rounded-pill bg-card" aria-hidden="true" />}>
          <Account placement="header" />
        </Suspense>
      </div>
    </header>
  );
}

/** The learner side bar from 768px (G, 2026-11-04): the brand, the links, then the account. */
export function AcademySidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-54 shrink-0 flex-col gap-4 border-r border-border bg-surface px-3 py-4 md:flex print:hidden">
      <Link href="/home" className="flex min-h-touch items-center rounded-button px-2">
        <Wordmark />
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AcademyNav
          extra={
            <Suspense fallback={null}>
              <ServiceDashboardNavLink />
            </Suspense>
          }
        />
      </div>
      <Suspense fallback={<div className="min-h-11" aria-hidden="true" />}>
        <Account placement="sidebar" />
      </Suspense>
    </aside>
  );
}

// The phone bar and the side bar both render this, and CSS shows one, so load it once per request.
const loadAccount = cache(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  // Only areas a person may use are offered (SPEC §8); each admin page checks again on the server.
  const active = user.status === "active";
  const [[grants, unread, planningCenter], appearance] = await Promise.all([
    active
      ? Promise.all([getMyCapabilities(), getUnreadCount(user.id), getMyPlanningCenter()])
      : Promise.resolve([[], 0, { linked: false, name: null, teams: [] }] as const),
    getAppearance(),
  ]);
  return {
    user,
    unread,
    planningCenter,
    appearance,
    showAdmin: active && adminSections(grants).length > 0,
  };
});

async function Account({ placement }: { placement: "header" | "sidebar" }) {
  const account = await loadAccount();
  if (!account) {
    return null;
  }
  const { user, unread, planningCenter, appearance, showAdmin } = account;
  return (
    <div
      className={
        placement === "sidebar"
          ? "flex items-center gap-1 border-t border-border pt-3"
          : "flex items-center gap-2"
      }
    >
      {placement === "sidebar" ? null : <ThemeToggle initial={appearance} />}
      <div className={placement === "sidebar" ? "min-w-0 flex-1" : ""}>
        <AccountMenu
          displayName={user.displayName}
          initials={initials(user.displayName)}
          email={user.email}
          planningCenter={planningCenter.linked}
          showAdmin={showAdmin}
          unread={unread}
          placement={placement}
        />
      </div>
      {placement === "sidebar" ? <ThemeToggle initial={appearance} /> : null}
    </div>
  );
}
