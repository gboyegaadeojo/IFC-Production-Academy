import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getServiceDashboardLayout } from "@/lib/data/service-dashboard";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { LayoutEditor } from "./layout-editor";
import { SetupTabs } from "./tabs";

export const metadata: Metadata = { title: "Service Dashboard setup" };

export default function ServiceDashboardSetupPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the layout…" />}>
      <ServiceDashboardSetupContent />
    </Suspense>
  );
}

/** The one layout everyone sees, and the screen for changing it (ADD-DASH-03). */
async function ServiceDashboardSetupContent() {
  const { allowed, grants } = await getAdminAccess("service-dashboard");
  if (!allowed) {
    return <AccessDenied />;
  }
  const layout = await getServiceDashboardLayout();
  const canEdit = hasCapability(grants, "dashboard.edit");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">Service Dashboard setup</h1>
        <p className="max-w-2xl text-text-secondary">
          Everyone on the team and the wall TV see this one layout.{" "}
          <Link href="/service-dashboard" className="text-accent-light underline">
            Open the Service Dashboard
          </Link>{" "}
          <Link href="/help/runbook-service-dashboard" className="text-accent-light underline">
            Setup guide
          </Link>
        </p>
      </header>
      <SetupTabs current="layout" grants={grants} />
      {canEdit ? null : (
        <p className="max-w-2xl rounded-card border border-warning-line bg-warning-soft p-3 text-small">
          Only editors can change the layout. Add yourself or someone else under Editors.
        </p>
      )}
      <LayoutEditor initial={layout} canEdit={canEdit} />
    </div>
  );
}
