import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getTeamAlertStatus } from "@/lib/data/push";
import {
  alertShown,
  alertsOffFor,
  APP_PLATFORM_LABELS,
  sortForFollowUp,
} from "@/lib/domain/alerts";
import { NOTIFICATION_GROUPS } from "@/lib/domain/notifications";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { TeamAlerts, type TeamPerson } from "./team-alerts";

export const metadata: Metadata = { title: "Phone alerts and app" };

export default function AlertsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading phone alerts…" />}>
      <AlertsContent />
    </Suspense>
  );
}

/**
 * Who on a team has the app and alerts on (decision 2026-11-05; the app added 2026-11-10). Leaders
 * follow up in person: the app can ask, but only each person can install it or turn alerts on.
 */
async function AlertsContent() {
  const { allowed } = await getAdminAccess("alerts");
  if (!allowed) {
    return <AccessDenied />;
  }
  const rows = sortForFollowUp(await getTeamAlertStatus());
  const people: TeamPerson[] = rows.map((row) => {
    const offGroups = alertsOffFor(row.pushOffKinds, NOTIFICATION_GROUPS);
    return {
      userId: row.userId,
      displayName: row.displayName,
      departments: row.departments,
      appOn: row.appPlatforms.map((platform) => APP_PLATFORM_LABELS[platform]),
      shown: alertShown(row.status, offGroups),
      devices: row.devices,
      offGroups,
    };
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Phone alerts and app"
        description="Who on your teams has the app on their phone and alerts turned on. Only they can do it, so anyone missing something may need a hand."
      />
      {people.length === 0 ? (
        <EmptyState title="Nobody's on a team yet">
          People show here once they join a department or a position&apos;s team.
        </EmptyState>
      ) : (
        <>
          <TeamAlerts people={people} />
          <p className="max-w-[70ch] text-small text-text-muted">
            The app is counted once someone opens it from their Home Screen, and a phone
            doesn&apos;t say when it&apos;s deleted. Someone can switch alerts off in their
            phone&apos;s settings without the Academy knowing until an alert fails to reach them, so
            On means the last we heard.
          </p>
        </>
      )}
    </div>
  );
}
