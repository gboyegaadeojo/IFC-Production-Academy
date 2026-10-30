import type { Metadata } from "next";
import { Suspense } from "react";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { adminSections } from "@/lib/domain/admin";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <aside className="md:w-56 md:shrink-0">
        <Suspense fallback={null}>
          <Navigation />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

async function Navigation() {
  await requireActiveUser();
  const sections = adminSections(await getMyCapabilities());
  return sections.length > 0 ? <AdminNav sections={sections} /> : null;
}
