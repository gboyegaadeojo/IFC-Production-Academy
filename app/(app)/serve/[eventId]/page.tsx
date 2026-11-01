import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChecklistItem } from "@/components/checklist/checklist-item";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getServiceChecklists, getServiceHeader } from "@/lib/data/checklists";
import { percentDone, progressLabel, type ServiceChecklist } from "@/lib/domain/checklists";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { resetAction, setItemAction, undoResetAction } from "../actions";

export const metadata: Metadata = { title: "Service checklist" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/serve/[eventId]">;

export default function ServePage({ params }: Props) {
  return (
    <Suspense fallback={<ServeSkeleton />}>
      <ServeContent params={params} />
    </Suspense>
  );
}

/**
 * Service day (decision record 9, stage 2): the pre-service checklists for one service, your own
 * first. Everyone serving can tick; whoever leads the service can reset and undo.
 */
async function ServeContent({ params }: Pick<Props, "params">) {
  await requireActiveUser();
  const { eventId } = await params;
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

  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
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
        <EmptyState title="You're not serving at this service">
          Checklists are for the people scheduled at a service and the leaders running it.
        </EmptyState>
      ) : data.checklists.length === 0 ? (
        <EmptyState title="No checklists yet">
          A leader can set them up in Pre-service checklists.
        </EmptyState>
      ) : (
        <>
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
                  <a
                    href={`#checklist-${checklist.id}`}
                    className="flex flex-col gap-2 rounded-card border border-border p-3 hover:bg-card"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-text">{checklist.name}</span>
                      {checklist.isMine ? <StatusBadge tone="info">Yours</StatusBadge> : null}
                    </span>
                    <ProgressBar
                      percent={percentDone(checklist.done, checklist.total)}
                      label={`${checklist.name}: ${progressLabel(checklist.done, checklist.total)}`}
                    />
                    <span className="text-small text-text-secondary">
                      {progressLabel(checklist.done, checklist.total)}
                    </span>
                  </a>
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

          {others.length > 0 ? (
            <section aria-labelledby="others-heading" className="flex max-w-3xl flex-col gap-3">
              <h2 id="others-heading" className="text-heading font-semibold">
                {mine.length > 0 ? "Helping elsewhere" : "Checklists"}
              </h2>
              {others.map((checklist) => (
                <details
                  key={checklist.id}
                  id={`checklist-${checklist.id}`}
                  open={data.state.canLead || mine.length === 0}
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
                />
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
                  />
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

function ServeSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the checklists…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-60 max-w-3xl" />
    </div>
  );
}
