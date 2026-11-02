import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { TileWall } from "@/components/service-dashboard/tile-wall";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { canViewServiceDashboard, getServiceDashboardLayout } from "@/lib/data/service-dashboard";
import { canOpenAdminSection } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import { TILES } from "@/lib/domain/service-dashboard";

export const metadata: Metadata = { title: "Service Dashboard" };

export default function ServiceDashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-[92.5rem] flex-1 flex-col gap-3 px-4 py-4 lg:px-6">
      <Suspense
        fallback={
          <>
            <LoadingStatus label="Loading the Service Dashboard…" />
            <Skeleton className="h-96 w-full" />
          </>
        }
      >
        <ServiceDashboardContent />
      </Suspense>
    </div>
  );
}

/**
 * One screen for the whole service (ADD-DASH-01). Computers only: phones and the installed app get
 * a message instead (ADD-DASH-02). It only ever reads, so it can't affect the live service.
 */
async function ServiceDashboardContent() {
  await requireActiveUser();
  if (!(await canViewServiceDashboard())) {
    return (
      <section className="flex max-w-xl flex-col gap-3 rounded-card border border-border bg-card p-8">
        <h1 className="text-heading font-semibold">The Service Dashboard isn&apos;t open to you</h1>
        <p className="text-text-secondary">
          It&apos;s for people on a production team in Planning Center. If you&apos;re on a team and
          still see this, talk to the Production Director or a Platform Admin.
        </p>
        <Link href="/home" className={buttonClasses("secondary", "self-start")}>
          Back to Training
        </Link>
      </section>
    );
  }

  const [layout, grants] = await Promise.all([getServiceDashboardLayout(), getMyCapabilities()]);
  const canEdit =
    hasCapability(grants, "dashboard.edit") || canOpenAdminSection(grants, "service-dashboard");

  return (
    <>
      <section className="only-on-small-screens flex max-w-xl flex-col gap-3 rounded-card border border-border bg-card p-6">
        <h1 className="text-heading font-semibold">Open this on a computer</h1>
        <p className="text-text-secondary">
          The Service Dashboard is made for booth computers and the wall TV. Your training,
          schedule, checklist, and SOPs all work here.
        </p>
        <Link href="/home" className={buttonClasses("primary", "self-start")}>
          Go to Training
        </Link>
      </section>

      <div className="only-on-computer flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-title font-semibold">Service Dashboard</h1>
            <p className="text-small text-text-secondary">
              One screen for the whole team. It only watches, so nothing here can change the
              service.
            </p>
          </div>
          {canEdit ? (
            <Link href="/admin/service-dashboard" className={buttonClasses("secondary")}>
              Edit layout
            </Link>
          ) : null}
        </header>
        <TileWall
          items={layout.items}
          content={(item) => (
            <p className="text-small text-text-secondary">
              Not connected yet. This will come from {TILES[item.tile].source}.
            </p>
          )}
        />
      </div>
    </>
  );
}
