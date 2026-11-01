import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/checklist/auto-refresh";
import { ChecklistItem } from "@/components/checklist/checklist-item";
import { TabIdField } from "@/components/checklist/tab-id";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getServiceChecklists, getServiceHeader } from "@/lib/data/checklists";
import { percentDone, progressLabel, type ServiceChecklist } from "@/lib/domain/checklists";
import { eventTimeLabel, TIME_ZONE } from "@/lib/domain/schedule";
import { resetAction, setItemAction, undoResetAction } from "../actions";

export const metadata: Metadata = { title: "Service checklist" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/serve/[eventId]">;

export default function ServePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ServeSkeleton />}>
      <ServeContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Service day (decision record 9, stage 2), as IFC's checklist app works (its US-02, US-05,
 * US-09, US-10). A scheduled volunteer sees their own checklist, and can show every department to
 * help elsewhere. Anyone on the media team can open it and help, scheduled or not. Whoever leads
 * the service (such as the Technical Director) sees every department by default, and can reset
 * and undo. The team's progress is for everyone.
 */
async function ServeContent({ params, searchParams }: Props) {
  await requireActiveUser();
  const { eventId } = await params;
  const { all } = await searchParams;
  if (!UUID.test(eventId)) {
    notFound();
  }
  const [service, data] = await Promise.all([
    getServiceHeader(eventId),
    getServiceChecklists(eventId),
  ]);
  if (!service) {
    notFound();
  }

  const mine = data?.checklists.filter((c) => c.isMine) ?? [];
  const others = data?.checklists.filter((c) => !c.isMine) ?? [];
  const canTick = Boolean(data?.state.canTick && data.state.open);
  // "Sees all departments" positions, and anyone without a checklist of their own here, see
  // every department; everyone else can choose to.
  const showAll = Boolean(data?.state.seesAll) || mine.length === 0 || all === "1";
  const canChoose = mine.length > 0 && others.length > 0 && !data?.state.seesAll;

  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      {data ? <AutoRefresh /> : null}
      <header className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: "Schedule", href: "/schedule" }, { label: service.title }]} />
        <h1 className="text-title font-semibold">{service.title}</h1>
        <p className="text-text-secondary">
          {eventTimeLabel(service.startsAt, service.endsAt)}
          {service.location ? ` · ${service.location}` : ""}
        </p>
        {service.cancelled ? <StatusBadge tone="neutral">Cancelled</StatusBadge> : null}
      </header>

      {!data ? (
        <EmptyState title="This checklist is for the media team">
          If you think you should have access, ask a scheduling administrator to add you to a
          position&apos;s team.
        </EmptyState>
      ) : data.checklists.length === 0 ? (
        <EmptyState title="No checklists yet">
          A leader can set them up in Pre-service checklists.
        </EmptyState>
      ) : (
        <>
          {!data.state.isScheduled && data.state.canTick && !data.state.seesAll ? (
            <p className="max-w-2xl rounded-card border border-border p-4 text-small text-text-secondary">
              You&apos;re not on the schedule for this service, but you can still help.
            </p>
          ) : null}
          {!data.state.open ? (
            <p className="max-w-2xl rounded-card border border-border p-4 text-small text-text-secondary">
              Ticking opens two days before the service and closes twelve hours after it. This is
              how the checklists stand.
            </p>
          ) : null}

          <section aria-labelledby="progress-heading" className="flex max-w-3xl flex-col gap-3">
            <h2 id="progress-heading" className="text-heading font-semibold">
              Team progress
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.checklists.map((checklist) => (
                <li key={checklist.id}>
                  <details className="rounded-card border border-border">
                    <summary className="flex cursor-pointer flex-col gap-2 p-3">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text">{checklist.name}</span>
                        <StatusBadge tone={progressTone(checklist.done, checklist.total)}>
                          {progressLabel(checklist.done, checklist.total)}
                        </StatusBadge>
                      </span>
                      <ProgressBar
                        percent={percentDone(checklist.done, checklist.total)}
                        label={`${checklist.name}: ${progressLabel(checklist.done, checklist.total)}`}
                      />
                    </summary>
                    <ul className="flex flex-col gap-1 border-t border-border px-3 py-2 text-small">
                      {checklist.sections
                        .flatMap((section) => section.items)
                        .filter((item) => item.checkedAt)
                        .map((item) => (
                          <li key={item.id} className="text-text-secondary">
                            {item.text}: {item.checkedByName}, {formatTime(item.checkedAt!)}
                          </li>
                        ))}
                      {checklist.done === 0 ? (
                        <li className="text-text-muted">Nothing ticked yet.</li>
                      ) : null}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>

          {mine.map((checklist) => (
            <Checklist
              key={checklist.id}
              checklist={checklist}
              eventId={service.id}
              canTick={canTick}
            />
          ))}

          {canChoose ? (
            <Link
              href={showAll ? `/serve/${service.id}` : `/serve/${service.id}?all=1`}
              scroll={false}
              className="flex min-h-control max-w-3xl items-center text-small font-medium text-accent-light underline-offset-4 hover:underline"
            >
              {showAll ? "Show only my checklist" : "Show all departments"}
            </Link>
          ) : null}

          {showAll && others.length > 0 ? (
            <section aria-labelledby="others-heading" className="flex max-w-3xl flex-col gap-3">
              <h2 id="others-heading" className="text-heading font-semibold">
                {mine.length > 0 ? "Other departments" : "Every department"}
              </h2>
              {others.map((checklist) => (
                <details
                  key={checklist.id}
                  id={`checklist-${checklist.id}`}
                  open
                  className="rounded-card border border-border"
                >
                  <summary className="flex min-h-touch cursor-pointer items-center justify-between gap-2 px-4 font-medium">
                    {checklist.name}
                    <span className="text-small font-normal text-text-muted">
                      {progressLabel(checklist.done, checklist.total)}
                    </span>
                  </summary>
                  <ChecklistBody checklist={checklist} eventId={service.id} canTick={canTick} />
                </details>
              ))}
            </section>
          ) : null}

          {data.state.canLead && data.state.open ? (
            <section
              aria-labelledby="lead-heading"
              className="flex max-w-2xl flex-col gap-3 rounded-card border border-border p-5"
            >
              <h2 id="lead-heading" className="text-subheading font-semibold">
                Leading this service
              </h2>
              {data.state.undoAvailable ? (
                <ActionForm
                  action={undoResetAction}
                  submitLabel="Undo the last reset"
                  pendingLabel="Undoing…"
                  variant="secondary"
                  hidden={{ eventId: service.id }}
                >
                  <TabIdField />
                </ActionForm>
              ) : null}
              <details>
                <summary className="flex min-h-control cursor-pointer items-center text-small font-medium">
                  Clear every tick for this service
                </summary>
                <p className="mt-2 text-small text-text-secondary">
                  Use this if the checklist was ticked by mistake. The ticks are kept, and you can
                  undo it.
                </p>
                <div className="mt-3">
                  <ActionForm
                    action={resetAction}
                    submitLabel="Reset checklists"
                    pendingLabel="Resetting…"
                    variant="destructive"
                    hidden={{ eventId: service.id }}
                  >
                    <TabIdField />
                  </ActionForm>
                </div>
              </details>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Checklist({
  checklist,
  eventId,
  canTick,
}: {
  checklist: ServiceChecklist;
  eventId: string;
  canTick: boolean;
}) {
  return (
    <section
      id={`checklist-${checklist.id}`}
      aria-labelledby={`heading-${checklist.id}`}
      className="flex max-w-3xl flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`heading-${checklist.id}`} className="text-heading font-semibold">
          Your checklist: {checklist.name}
        </h2>
        <span className="text-small text-text-secondary">
          {progressLabel(checklist.done, checklist.total)}
        </span>
      </div>
      <div className="rounded-card border border-border">
        <ChecklistBody checklist={checklist} eventId={eventId} canTick={canTick} />
      </div>
    </section>
  );
}

function ChecklistBody({
  checklist,
  eventId,
  canTick,
}: {
  checklist: ServiceChecklist;
  eventId: string;
  canTick: boolean;
}) {
  return (
    <div className="flex flex-col">
      {checklist.sections.map((section) => (
        <div key={section.id} className="border-t border-border first:border-t-0">
          <h3 className="px-4 pt-3 text-small font-semibold text-text-secondary">{section.name}</h3>
          <ul className="flex flex-col">
            {section.items.map((item) => (
              <ChecklistItem
                key={item.id}
                eventId={eventId}
                itemId={item.id}
                text={item.text}
                checked={item.checkedAt !== null}
                checkedBy={item.checkedByName}
                disabled={!canTick}
                action={setItemAction}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** Done, started, or not started: always with words beside the colour. */
function progressTone(done: number, total: number): "success" | "pending" | "neutral" {
  return total > 0 && done === total ? "success" : done > 0 ? "pending" : "neutral";
}

function ServeSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the checklists…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-60 max-w-3xl" />
    </div>
  );
}
