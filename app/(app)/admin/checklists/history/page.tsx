import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getChecklistHistory } from "@/lib/data/checklists";
import { progressLabel } from "@/lib/domain/checklists";
import { formatDate } from "@/lib/domain/dates";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";

export const metadata: Metadata = { title: "Service history" };

export default function ServiceHistoryPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading service history…" />}>
      <HistoryContent />
    </Suspense>
  );
}

/** Each service's checklists: "X of Y done", newest first (checklist app US-07b). */
async function HistoryContent() {
  const { allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const services = await getChecklistHistory();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Service history"
        description="What was done and what was missed at each service. A service's record is fixed when its day ends, so later checklist changes never alter it."
      />
      {services.length === 0 ? (
        <EmptyState title="No services yet">Past services appear here.</EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
          {services.map((service) => (
            <li key={service.id}>
              <Link
                href={`/admin/checklists/history/${service.id}`}
                className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-text">{service.title}</span>
                  <span className="text-small text-text-muted">{formatDate(service.startsAt)}</span>
                </span>
                {service.hasRecord ? (
                  <StatusBadge
                    tone={
                      service.total > 0 && service.done === service.total
                        ? "success"
                        : service.done > 0
                          ? "pending"
                          : "neutral"
                    }
                  >
                    {progressLabel(service.done, service.total)}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">{service.done} ticked (no record)</StatusBadge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
