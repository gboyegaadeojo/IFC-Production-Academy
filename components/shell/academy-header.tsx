import Link from "next/link";
import { cache, Suspense } from "react";
import { BrandMark, Wordmark } from "@/components/brand";
import { getAppearance } from "@/lib/data/appearance";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getUnreadCount } from "@/lib/data/notifications";
import { adminSections } from "@/lib/domain/admin";
import { initials } from "@/lib/domain/people";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "./account-menu";
import { AcademyNav } from "./academy-nav";
import { NotificationsBell } from "./notifications-bell";
import { ServiceDashboardNavLink } from "./service-dashboard-nav-link";

/** Slim bar on phones: the brand, then light or dark, the bell, and the account (mock 5). */
export function AcademyHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)] md:hidden print:hidden">
      <div className="page-container flex min-h-14 items-center justify-between gap-3">
        <Link href="/home" className="flex min-h-touch items-center rounded-button">
          <Wordmark />
        </Link>
        <Suspense fallback={<div className="size-10 rounded-pill bg-card" aria-hidden="true" />}>
          <Account placement="header" />
        </Suspense>
      </div>
    </header>
  );
}

/**
 * The learner side bar from 768px (mock 5, approved 2026-11-06): a narrow bar of icons with their
 * names, then light or dark, the bell, and your name at the bottom, which opens the account menu.
 */
export function AcademySidebar() {
  return (
    // Sticky makes the side bar its own layer, so it needs a z-index of its own: without one, the
    // page content painted after it (course posters, cards) covered the account menu opening out.
    <aside className="sticky top-0 z-30 hidden h-dvh w-24 shrink-0 flex-col items-center gap-3 border-r border-border bg-surface py-4 md:flex print:hidden">
      <Link
        href="/home"
        title="Training"
        className="flex min-h-touch items-center justify-center rounded-button px-2"
      >
        <BrandMark height={28} />
        <span className="sr-only">Training</span>
      </Link>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto">
        <AcademyNav
          extra={
            <Suspense fallback={null}>
              <ServiceDashboardNavLink />
            </Suspense>
          }
        />
      </div>
      <Suspense fallback={<div className="min-h-36" aria-hidden="true" />}>
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
  return (
    <div
      className={
        placement === "rail"
          ? "flex flex-col items-center gap-2 border-t border-border pt-3"
          : "flex items-center gap-2"
      }
    >
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
