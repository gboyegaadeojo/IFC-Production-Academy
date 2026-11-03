import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getServiceDashboardLayout } from "@/lib/data/service-dashboard";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { SetupTabs } from "../tabs";
import { ChannelPicker } from "./channel-picker";

export const metadata: Metadata = { title: "Service Dashboard mixer channels" };

export default function ServiceDashboardChannelsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading channels…" />}>
      <ServiceDashboardChannelsContent />
    </Suspense>
  );
}

/** Which mixer channels the levels tile shows, in order (ADD-DASH-08). Never touches the mixer. */
async function ServiceDashboardChannelsContent() {
  const { allowed, grants } = await getAdminAccess("service-dashboard");
  if (!allowed) {
    return <AccessDenied />;
  }
  const layout = await getServiceDashboardLayout();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">Service Dashboard setup</h1>
        <p className="max-w-2xl text-text-secondary">
          Choose what the Mixer levels tile shows, in the order you want. Everyone sees the same
          set. This only changes the dashboard. It never touches the mixer.
        </p>
      </header>
      <SetupTabs current="channels" grants={grants} />
      <ChannelPicker layout={layout} canEdit={hasCapability(grants, "dashboard.edit")} />
    </div>
  );
}
