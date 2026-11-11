import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { getPcoLastSynced, getSchedulingSource } from "@/lib/data/planning-center";
import { canOpenAdminSection } from "@/lib/domain/admin";
import type { CapabilityGrant } from "@/lib/domain/capabilities";
import { syncedAgo, syncedAtLabel, syncIsLate } from "@/lib/domain/schedule";
import { refreshAction } from "./planning-center/actions";

/**
 * The warning when Planning Center hasn't synced for an hour (mock, 2026-11-11), on the Admin home
 * and the Planning Center page, for people who run the teams. It goes away by itself once a sync
 * works. Only while Planning Center schedules: the Academy's own scheduler doesn't sync.
 */
export async function SyncWarning({
  grants,
  onPlanningCenterPage = false,
}: {
  grants: readonly CapabilityGrant[];
  onPlanningCenterPage?: boolean;
}) {
  if (!canOpenAdminSection(grants, "planning-center")) {
    return null;
  }
  const [source, lastSynced] = await Promise.all([getSchedulingSource(), getPcoLastSynced()]);
  if (source !== "planning_center" || !syncIsLate(lastSynced)) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-warning/50 bg-warning/10 px-4 py-3.5 sm:flex-row sm:items-start"
    >
      <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold text-text">
          {lastSynced
            ? `Schedules haven't updated from Planning Center since ${syncedAtLabel(lastSynced)} (${syncedAgo(lastSynced)})`
            : "Schedules haven't come in from Planning Center yet"}
        </p>
        <p className="text-small text-text-secondary">
          Changes made in Planning Center aren&apos;t showing here yet. Admins are emailed once when
          it stops, and again when it&apos;s working. This goes away by itself once a sync works.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-start gap-2">
        <ActionForm
          action={refreshAction}
          submitLabel="Try again now"
          pendingLabel="Asking…"
          className="flex flex-col gap-2"
        />
        {onPlanningCenterPage ? null : (
          <Link
            href="/admin/planning-center"
            className="inline-flex min-h-touch items-center rounded-button border border-border bg-surface px-3.5 text-small font-semibold text-text hover:bg-hover"
          >
            Planning Center page
          </Link>
        )}
      </div>
    </div>
  );
}
