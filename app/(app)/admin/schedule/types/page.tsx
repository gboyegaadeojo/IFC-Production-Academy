import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listServiceTypes } from "@/lib/data/service-types";
import { serviceTimeLabel } from "@/lib/domain/service-types";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { ScheduleTabs } from "../schedule-tabs";
import { createServiceTypeAction } from "./actions";
import { ServiceTypeFields } from "./service-type-fields";

export const metadata: Metadata = { title: "Service types" };

export default function ServiceTypesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading service types…" />}>
      <ServiceTypesContent />
    </Suspense>
  );
}

/** Service types (decision record 9): set up each kind of service once, then make its dates. */
async function ServiceTypesContent() {
  const { allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const serviceTypes = await listServiceTypes();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="Set up each kind of service once, with its time and positions. Then make the next weeks' services in one step."
      />
      <ScheduleTabs current="types" />

      <section aria-labelledby="types-heading" className="flex flex-col gap-3">
        <h2 id="types-heading" className="text-heading font-semibold">
          Service types
        </h2>
        {serviceTypes.length === 0 ? (
          <EmptyState title="No service types yet">
            Add your regular services below, such as the Sunday service or a communion service.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {serviceTypes.map((type) => (
              <li key={type.id}>
                <Link
                  href={`/admin/schedule/types/${type.id}`}
                  className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card"
                >
                  <span className="font-medium text-text">{type.name}</span>
                  <span className="text-small text-text-muted">
                    {serviceTimeLabel(type.startTime, type.durationMinutes)} ·{" "}
                    {type.positions.length === 1
                      ? "1 position"
                      : `${type.positions.length} positions`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="new-type-heading"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-dashed border-border p-5"
      >
        <h2 id="new-type-heading" className="text-subheading font-semibold">
          Add a service type
        </h2>
        <ActionForm
          action={createServiceTypeAction}
          submitLabel="Add service type"
          pendingLabel="Adding…"
        >
          <ServiceTypeFields />
        </ActionForm>
      </section>
    </div>
  );
}
