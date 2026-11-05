import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getTeamAlertStatus } from "@/lib/data/push";
import {
  ALERT_STATUS_LABELS,
  alertSummary,
  sortForFollowUp,
  type AlertStatus,
} from "@/lib/domain/alerts";
import { formatDate } from "@/lib/domain/dates";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";

export const metadata: Metadata = { title: "Phone alerts" };

export default function AlertsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading phone alerts…" />}>
      <AlertsContent />
    </Suspense>
  );
}

const TONES: Record<AlertStatus, "success" | "pending" | "neutral"> = {
  on: "success",
  computer_only: "pending",
  off: "pending",
  cannot: "neutral",
};

/**
 * Who on a team has phone alerts on (decision 2026-11-05). Leaders follow up in person: the app can
 * ask, but only each person can turn alerts on.
 */
async function AlertsContent() {
  const { allowed } = await getAdminAccess("alerts");
  if (!allowed) {
    return <AccessDenied />;
  }
  const people = sortForFollowUp(await getTeamAlertStatus());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Phone alerts"
        description="Who on your teams has alerts on their phone. Everyone is asked to turn them on, but only they can do it, so anyone still listed as Not on may need a hand."
      />
      {people.length === 0 ? (
        <EmptyState title="Nobody's on a team yet">
          People show here once they join a department or a position&apos;s team.
        </EmptyState>
      ) : (
        <section aria-labelledby="alerts-list-heading" className="flex flex-col gap-3">
          <h2 id="alerts-list-heading" className="font-semibold">
            {alertSummary(people)}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {people.map((person) => (
              <li
                key={person.userId}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={person.displayName} />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{person.displayName}</span>
                    <span className="text-small text-text-muted">
                      {person.departments.join(", ")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 sm:items-end">
                  <StatusBadge tone={TONES[person.status]}>
                    {ALERT_STATUS_LABELS[person.status]}
                  </StatusBadge>
                  {person.devices.length > 0 ? (
                    <span className="text-small text-text-muted">
                      {person.devices.join(", ")}
                      {person.lastSentAt ? ` · Last alert ${formatDate(person.lastSentAt)}` : ""}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-small text-text-muted">
            Someone can switch alerts off in their phone&apos;s settings without the Academy knowing
            until an alert fails to reach them, so On means the last we heard.
          </p>
        </section>
      )}
    </div>
  );
}
