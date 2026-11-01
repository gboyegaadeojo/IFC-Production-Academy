import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { signOutAction } from "@/app/auth/actions";
import { Drawer } from "@/components/ui/drawer";
import { getCurrentUser, requireActiveUser } from "@/lib/data/auth";
import { getAdminNavCounts } from "@/lib/data/admin/overview";
import { getAppearance } from "@/lib/data/appearance";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getUnreadCount } from "@/lib/data/notifications";
import { adminNavigation } from "@/lib/domain/admin";
import { initials } from "@/lib/domain/people";
import {
  AdminCurrentLabel,
  AdminSidebar,
  SIDEBAR_COOKIE,
  type AdminNavGroup,
} from "./admin-sidebar";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" } };

/**
 * Admin workspace (DESIGN §3.2): a full-height sidebar from 1024px up (256px, or 72px icons
 * only), and below that a slim bar whose menu opens the same sidebar in a drawer. The Academy's
 * top header isn't shown here: the sidebar has the brand, the workspace switcher and the account.
 * Links come from adminNavigation(); every page still checks its own capability.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <Suspense fallback={<SidebarPlaceholder />}>
        <Navigation />
      </Suspense>
      <div className="min-w-0 flex-1 px-4 py-8 md:px-8 lg:py-10 xl:px-12">
        <div className="mx-auto w-full max-w-[72rem]">{children}</div>
      </div>
    </div>
  );
}

function SidebarPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="hidden h-dvh w-64 shrink-0 border-r border-border bg-surface lg:block"
    />
  );
}

async function Navigation() {
  await requireActiveUser();
  const [user, grants, appearance, cookieStore] = await Promise.all([
    getCurrentUser(),
    getMyCapabilities(),
    getAppearance(),
    cookies(),
  ]);
  const groups: AdminNavGroup[] = adminNavigation(grants);
  if (!user || groups.length === 0) {
    return null;
  }
  const [counts, unread] = await Promise.all([getAdminNavCounts(grants), getUnreadCount(user.id)]);
  const account = {
    displayName: user.displayName,
    initials: initials(user.displayName),
    showAdmin: true,
    unread,
    appearance,
    signOut: signOutAction,
  };
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <>
      {/* Below 1024px: a slim bar with the current page, and the sidebar in a drawer. */}
      <div className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-border bg-bg px-2 md:px-6 lg:hidden">
        <Drawer title="Admin menu" triggerLabel="Open admin menu">
          <AdminSidebar groups={groups} counts={counts} account={account} variant="drawer" />
        </Drawer>
        <AdminCurrentLabel groups={groups} />
      </div>
      <aside
        aria-label="Admin sidebar"
        className="sticky top-0 hidden h-dvh shrink-0 border-r border-border lg:block"
      >
        <AdminSidebar
          groups={groups}
          counts={counts}
          account={account}
          initialCollapsed={collapsed}
        />
      </aside>
    </>
  );
}
