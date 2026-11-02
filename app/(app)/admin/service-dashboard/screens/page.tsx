import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getScreens } from "@/lib/data/screens";
import { formatDateTime } from "@/lib/domain/admin";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { SetupTabs } from "../tabs";
import { ScreenControls } from "./screen-controls";

export const metadata: Metadata = { title: "Service Dashboard screens" };

export default function ServiceDashboardScreensPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading screens…" />}>
      <ServiceDashboardScreensContent />
    </Suspense>
  );
}

/** TVs connected by code, each with a view-only pass (ADD-DASH-06). */
async function ServiceDashboardScreensContent() {
  const { allowed, grants } = await getAdminAccess("service-dashboard");
  if (!allowed) {
    return <AccessDenied />;
  }
  const screens = await getScreens();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">Service Dashboard setup</h1>
        <p className="max-w-2xl text-text-secondary">
          Connect a wall TV by opening <span className="font-mono">/screen</span> on it, then
          entering the code it shows. A screen holds a view-only pass, not anyone&apos;s account.
        </p>
      </header>
      <SetupTabs current="screens" grants={grants} />
      <ScreenControls
        screens={screens.map((screen) => ({
          id: screen.id,
          name: screen.name,
          detail: `${screen.lastSeenAt ? `Last seen ${formatDateTime(screen.lastSeenAt)}` : "Waiting for the TV to connect"}. Added by ${screen.addedByName ?? "someone no longer here"}.`,
        }))}
      />
    </div>
  );
}
