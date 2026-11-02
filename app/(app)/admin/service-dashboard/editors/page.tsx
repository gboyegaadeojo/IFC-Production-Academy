import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getServiceDashboardPeople } from "@/lib/data/service-dashboard";
import { hasCapability } from "@/lib/domain/capabilities";
import { MAX_EDITORS } from "@/lib/domain/service-dashboard";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { SetupTabs } from "../tabs";
import { EditorList } from "./editor-list";

export const metadata: Metadata = { title: "Service Dashboard editors" };

export default function ServiceDashboardEditorsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading editors…" />}>
      <ServiceDashboardEditorsContent />
    </Suspense>
  );
}

/** Up to 3 people can change the layout (ADD-DASH-03). The database enforces the limit. */
async function ServiceDashboardEditorsContent() {
  const { allowed, grants } = await getAdminAccess("service-dashboard");
  if (!allowed || !hasCapability(grants, "dashboard.manage")) {
    return <AccessDenied />;
  }
  const people = await getServiceDashboardPeople();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">Service Dashboard setup</h1>
        <p className="max-w-2xl text-text-secondary">
          Up to {MAX_EDITORS} people can change the layout. Everyone else can view it but can&apos;t
          change it.
        </p>
      </header>
      <SetupTabs current="editors" grants={grants} />
      <EditorList people={people} />
    </div>
  );
}
