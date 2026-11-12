import Link from "next/link";
import { cookies } from "next/headers";
import { cache, Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { ACADEMY_SIDEBAR_COOKIE } from "@/lib/domain/appearance";
import { getAppearance } from "@/lib/data/appearance";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getUnreadCount } from "@/lib/data/notifications";
import { adminSections } from "@/lib/domain/admin";
import { initials } from "@/lib/domain/people";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "./account-menu";
import { AcademyNav, SidebarFoldButton } from "./academy-nav";
import { MessagesNavLink } from "./messages-nav";
import { NotificationsBell } from "./notifications-bell";
import { CopyrightNavLink } from "./copyright-nav-link";
import { ServiceDashboardNavLink } from "./service-dashboard-nav-link";

/**
 * Slim bar on phones: the Signal Line mark alone (decision 2026-11-10; the full logo's "ACADEMY"
 * would be too small to read here), then light or dark, the bell, and the account (mock 5).
 */
export function AcademyHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)] md:hidden print:hidden">
      <div className="page-container flex min-h-14 items-center justify-between gap-3">
        <Link
          href="/home"
          title="Training"
          className="-ml-1.5 flex min-h-touch min-w-11 items-center justify-center rounded-button"
        >
          <BrandMark size={30} />
          <span className="sr-only">Training</span>
        </Link>
        <Suspense fallback={<div className="size-10 rounded-pill bg-card" aria-hidden="true" />}>
          <Account placement="header" />
        </Suspense>
      </div>
    </header>
  );
}

/**
 * The learner side bar from 768px (side bar B, G 2026-11-09): the brand, then each page with its
 * name in sections, and your name and the bell at the bottom. It folds to icons only, remembered on
 * this device; data-folded drives the folded look, so server-rendered links follow it too.
 */
export async function AcademySidebar() {
  const folded = (await cookies()).get(ACADEMY_SIDEBAR_COOKIE)?.value === "folded";
  return (
    // Sticky makes the side bar its own layer, so it needs a z-index of its own: without one, the
    // page content painted after it (course posters, cards) covered the account menu opening out.
    <aside
      data-folded={folded}
      className="group/sidebar sticky top-0 z-30 hidden h-dvh w-44 shrink-0 flex-col gap-1 border-r border-border bg-surface px-2.5 pt-3.5 pb-3 transition-[width] duration-[var(--duration-base)] ease-standard data-[folded=true]:w-[4.25rem] md:flex print:hidden"
    >
      {/* The fold tab sits on the side bar's right edge (fold option A, G 2026-11-10). */}
      <SidebarFoldButton initialFolded={folded} />
      <div className="mb-2 flex min-h-11 items-center group-data-[folded=true]/sidebar:justify-center">
        <Link
          href="/home"
          title="Training"
          className="flex min-h-touch min-w-11 items-center justify-center rounded-button px-1"
        >
          {/* The mark alone, open or folded (decision 2026-11-10). */}
          <BrandMark size={30} />
          <span className="sr-only">Training</span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AcademyNav
          messages={
            <Suspense fallback={null}>
              <MessagesNavLink />
            </Suspense>
          }
          extra={
            <>
              <Suspense fallback={null}>
                <ServiceDashboardNavLink />
              </Suspense>
              <Suspense fallback={null}>
                <CopyrightNavLink />
              </Suspense>
            </>
          }
        />
      </div>
      <Suspense fallback={<div className="min-h-14" aria-hidden="true" />}>
        <Account placement="rail" />
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
  const [[grants, unread], appearance] = await Promise.all([
    active
      ? Promise.all([getMyCapabilities(), getUnreadCount(user.id)])
      : Promise.resolve([[], 0] as const),
    getAppearance(),
  ]);
  return {
    user,
    unread,
    appearance,
    showAdmin: active && adminSections(grants).length > 0,
  };
});

async function Account({ placement }: { placement: "header" | "rail" }) {
  const account = await loadAccount();
  if (!account) {
    return null;
  }
  const { user, unread, appearance, showAdmin } = account;
  if (placement === "rail") {
    // Light or dark lives in the account menu here (side bar B, G 2026-11-09).
    return (
      <div className="flex flex-wrap items-center justify-center gap-1 border-t border-border pt-2.5">
        <AccountMenu
          displayName={user.displayName}
          initials={initials(user.displayName)}
          showAdmin={showAdmin}
          placement="rail"
          appearance={appearance}
        />
        <NotificationsBell unread={unread} placement="rail" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle initial={appearance} />
      <NotificationsBell unread={unread} placement={placement} />
      <AccountMenu
        displayName={user.displayName}
        initials={initials(user.displayName)}
        showAdmin={showAdmin}
        placement={placement}
      />
    </div>
  );
}
