import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getYoutubeChannel } from "@/lib/data/screens";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { SetupTabs } from "../tabs";
import { ChannelForm } from "./channel-form";

export const metadata: Metadata = { title: "Service Dashboard connections" };

export default function ServiceDashboardConnectionsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading connections…" />}>
      <ServiceDashboardConnectionsContent />
    </Suspense>
  );
}

/** Where the dashboard's numbers come from (ADD-DASH-07). Nothing here can control any of them. */
async function ServiceDashboardConnectionsContent() {
  const { allowed, grants } = await getAdminAccess("service-dashboard");
  if (!allowed || !hasCapability(grants, "dashboard.manage")) {
    return <AccessDenied />;
  }
  const channel = await getYoutubeChannel();
  const liveSet = Boolean(process.env.LIVE_ROOM_SECRET);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">Service Dashboard setup</h1>
        <p className="max-w-2xl text-text-secondary">
          Where the dashboard&apos;s numbers come from. It only reads from these, so nothing here
          can change the service.
        </p>
      </header>
      <SetupTabs current="connections" grants={grants} />

      <div className="flex max-w-2xl flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
          <h2 className="text-heading font-semibold">YouTube</h2>
          <p className="text-small text-text-secondary">
            Your stream is public, so nobody signs in and there&apos;s nothing to do each week. The
            live stream needs only the channel.
          </p>
          <ChannelForm initial={channel} />
        </section>

        <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
          <h2 className="text-heading font-semibold">Planning Center</h2>
          <p className="text-small text-text-secondary">
            Connected. The plan, times, and who&apos;s serving update every 15 minutes, read only.
          </p>
        </section>

        <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
          <h2 className="text-heading font-semibold">The church bridge</h2>
          <p className="text-small text-text-secondary">
            ProPresenter, the mixer, and the Magewell encoder connect through a small program on a
            church computer. It only connects outward, and it only reads.
          </p>
          <p className="text-small">
            <strong className="font-medium">Live room: </strong>
            {liveSet ? "Ready. " : "Not set up yet. "}
            See the{" "}
            <Link href="/help/runbook-service-dashboard" className="text-accent-light underline">
              setup guide
            </Link>
            .
          </p>
        </section>

        <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
          <h2 className="text-heading font-semibold">Still to come</h2>
          <p className="text-small text-text-secondary">Facebook, once it&apos;s been tested.</p>
        </section>
      </div>
    </div>
  );
}
