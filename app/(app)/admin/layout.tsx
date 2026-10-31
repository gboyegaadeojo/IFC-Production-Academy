import type { Metadata } from "next";
import { Suspense } from "react";
import { Drawer } from "@/components/ui/drawer";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { adminNavigation } from "@/lib/domain/admin";
import { AdminCurrentLabel, AdminNav, type AdminNavGroup } from "./admin-nav";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" } };

/**
 * Admin workspace (DESIGN §3.2): a persistent 256px sidebar from 1024px up, and a bar with a
 * drawer below that. Links come from adminSections(); every page still checks its own capability.
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
    <div aria-hidden="true" className="hidden w-64 shrink-0 border-r border-border lg:block" />
  );
}

async function Navigation() {
  await requireActiveUser();
  const groups: AdminNavGroup[] = adminNavigation(await getMyCapabilities());
  if (groups.length === 0) {
    return null;
  }
  return (
    <>
      {/* Below 1024px: a slim bar with the current section and a drawer for the rest. */}
      <div className="sticky top-14 z-20 flex min-h-12 items-center gap-2 border-b border-border bg-bg px-2 md:px-6 lg:hidden">
        <Drawer title="Admin" triggerLabel="Open admin menu">
          <AdminNav groups={groups} />
        </Drawer>
        <AdminCurrentLabel groups={groups} />
      </div>
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-3 py-6">
          <AdminNav groups={groups} />
        </div>
      </aside>
    </>
  );
}
