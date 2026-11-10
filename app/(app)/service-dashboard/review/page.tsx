import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { ReviewPicker } from "@/components/service-dashboard/service-picker";
import { buttonClasses } from "@/components/ui/button";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import {
  canViewServiceDashboard,
  getPlanItems,
  getReviewServices,
} from "@/lib/data/service-dashboard";
import { formatDate } from "@/lib/domain/dates";
import { countdownLabel, differenceLabel, reviewTiming } from "@/lib/domain/service-dashboard";

export const metadata: Metadata = { title: "After the service" };

const serviceParam = z.uuid();

export default function ServiceReviewPage({
  searchParams,
}: PageProps<"/service-dashboard/review">) {
  return (
    <div className="page-container flex flex-1 flex-col gap-4 py-8">
      <Suspense
        fallback={
          <>
            <LoadingStatus label="Loading the review…" />
            <Skeleton className="h-96 w-full" />
          </>
        }
      >
        <ServiceReviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * How the service went (ADD-DASH-10). It builds itself from what was recorded, so nothing is typed
 * in, and it doesn't pretend: an item with no recorded time says so.
 */
async function ServiceReviewContent({
  searchParams,
}: Pick<PageProps<"/service-dashboard/review">, "searchParams">) {
  await requireActiveUser();
  if (!(await canViewServiceDashboard())) {
    return (
      <section className="flex max-w-xl flex-col gap-3 rounded-card border border-border bg-card p-8">
        <h1 className="text-heading font-semibold">This isn&apos;t open to you</h1>
        <p className="text-text-secondary">
          It&apos;s for people on a production team in Planning Center.
        </p>
        <Link href="/home" className={buttonClasses("secondary", "self-start")}>
          Back to Training
        </Link>
      </section>
    );
  }

  const requested = serviceParam.safeParse((await searchParams).service);
  const services = await getReviewServices();
  const service = services.find((entry) => entry.id === requested.data) ?? services[0] ?? null;
  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-title font-semibold">After the service</h1>
        <p className="text-small text-text-secondary">How the timing went against the plan.</p>
      </div>
      <Link href="/service-dashboard" className={buttonClasses("secondary")}>
        Back to the dashboard
      </Link>
    </header>
  );
  if (!service) {
    return (
      <>
        {header}
        <p className="text-text-secondary">No past services yet.</p>
      </>
    );
  }

  const items = await getPlanItems(service.id);
  const timing = reviewTiming(items);
  const stat = "flex flex-col rounded-card border border-border bg-surface p-4";

  return (
    <>
      {header}
      <ReviewPicker
        current={service.id}
        services={services.map((entry) => ({
          id: entry.id,
          label: `${entry.title}, ${formatDate(entry.startsAt)}`,
        }))}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={stat}>
          <span className="text-small text-text-muted">Planned length</span>
          <span className="text-title font-bold tabular-nums">
            {countdownLabel(timing.plannedSeconds)}
          </span>
        </div>
        <div className={stat}>
          <span className="text-small text-text-muted">Against the plan</span>
          <span className="text-title font-bold tabular-nums">
            {timing.recorded > 0 ? differenceLabel(timing.overSeconds) : "Not recorded"}
          </span>
          {timing.recorded > 0 && timing.recorded < timing.rows.length ? (
            <span className="text-small text-text-secondary">
              From the {timing.recorded} of {timing.rows.length} items with a recorded time
            </span>
          ) : null}
        </div>
      </div>

      <section
        aria-labelledby="timing-heading"
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
      >
        <h2 id="timing-heading" className="text-heading font-semibold">
          Timing by item
        </h2>
        {timing.rows.length === 0 ? (
          <p className="text-small text-text-secondary">No run of service for this one.</p>
        ) : (
          <>
            {timing.recorded === 0 ? (
              <p className="text-small text-text-secondary">
                No actual times yet. They appear when someone runs the plan with Services LIVE in
                Planning Center.
              </p>
            ) : null}
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-small">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="py-1 font-medium">Item</th>
                    <th className="py-1 text-right font-medium">Planned</th>
                    <th className="py-1 text-right font-medium">Actual</th>
                    <th className="py-1 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {timing.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-1.5 pr-3">{row.title}</td>
                      <td className="py-1.5 text-right">{countdownLabel(row.plannedSeconds)}</td>
                      <td className="py-1.5 text-right">
                        {row.actualSeconds === null
                          ? "Not recorded"
                          : countdownLabel(row.actualSeconds)}
                      </td>
                      <td className="py-1.5 text-right">
                        {row.differenceSeconds === null
                          ? ""
                          : differenceLabel(row.differenceSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
