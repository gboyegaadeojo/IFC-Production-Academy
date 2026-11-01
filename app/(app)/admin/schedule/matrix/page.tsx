import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getMatrixServices, listServiceTypes } from "@/lib/data/service-types";
import { formatDate } from "@/lib/domain/dates";
import { buildMatrix } from "@/lib/domain/service-types";
import { ASSIGNMENT_STATUS_LABELS } from "@/lib/domain/schedule";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { ScheduleTabs } from "../schedule-tabs";

export const metadata: Metadata = { title: "Schedule matrix" };

export default function MatrixPage({ searchParams }: PageProps<"/admin/schedule/matrix">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the matrix…" />}>
      <MatrixContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The Matrix (decision record 9), as in Planning Center: the next services of one type side by
 * side, one row per position, so a month is planned on one screen. Each cell opens the service.
 */
async function MatrixContent({
  searchParams,
}: Pick<PageProps<"/admin/schedule/matrix">, "searchParams">) {
  const { allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const serviceTypes = await listServiceTypes();
  const params = await searchParams;
  const selected = serviceTypes.find((t) => t.id === params.type) ?? serviceTypes[0];
  const services = selected ? await getMatrixServices(selected.id) : [];
  const rows = buildMatrix(services);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="The next services side by side. Open a cell to schedule someone in that position."
      />
      <ScheduleTabs current="matrix" />
      {serviceTypes.length > 1 ? (
        <nav aria-label="Choose a service type" className="flex flex-wrap gap-2">
          {serviceTypes.map((type) => (
            <Link
              key={type.id}
              href={`/admin/schedule/matrix?type=${type.id}`}
              aria-current={type.id === selected?.id ? "true" : undefined}
              className={`inline-flex min-h-control items-center rounded-pill border px-3 text-small transition-surface ${
                type.id === selected?.id
                  ? "border-accent-light bg-hover font-medium text-text"
                  : "border-border text-text-secondary hover:border-border-strong hover:text-text"
              }`}
            >
              {type.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!selected ? (
        <EmptyState title="No service types yet">
          Set up a service type, make its dates, and they line up here.
        </EmptyState>
      ) : services.length === 0 ? (
        <EmptyState title={`No upcoming ${selected.name} services`}>
          Make the next dates from the service type.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="min-w-full border-collapse text-small">
            <caption className="sr-only">
              {selected.name}: positions by service. Each cell shows who is serving.
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 bg-surface px-3 py-2 text-left font-medium"
                >
                  Position
                </th>
                {services.map((service) => (
                  <th
                    key={service.id}
                    scope="col"
                    className="min-w-36 px-3 py-2 text-left font-medium whitespace-nowrap"
                  >
                    <Link
                      href={`/admin/schedule/${service.id}`}
                      className="text-accent-light underline-offset-4 hover:underline"
                    >
                      {formatDate(service.startsAt)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 bg-surface px-3 py-2 text-left align-top font-normal"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium text-text">{row.label}</span>
                      <span className="text-text-muted">{row.departmentName}</span>
                    </span>
                  </th>
                  {row.cells.map((cell, index) => (
                    <td key={index} className="px-3 py-2 align-top">
                      {cell === null ? (
                        <span className="text-text-muted">
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">Not needed</span>
                        </span>
                      ) : (
                        <Link
                          href={`/admin/schedule/${services[index]!.id}`}
                          className="flex flex-col rounded-button px-1 py-0.5 hover:bg-card"
                        >
                          {cell.person ? (
                            <>
                              <span className="text-text">{cell.person.name}</span>
                              <span
                                className={
                                  cell.person.status === "confirmed"
                                    ? "text-success"
                                    : "text-warning"
                                }
                              >
                                {ASSIGNMENT_STATUS_LABELS[cell.person.status]}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium text-accent-light">Open</span>
                          )}
                        </Link>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
