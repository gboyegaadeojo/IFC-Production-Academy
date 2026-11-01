import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/checklist/auto-refresh";
import { ServiceBoard, type BoardChecklist } from "@/components/checklist/service-board";
import { TabIdField } from "@/components/checklist/tab-id";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getServiceChecklists, getServiceHeader } from "@/lib/data/checklists";
import {
  boardOrder,
  NOT_PUBLISHED_NOTE,
  percentDone,
  servingLabel,
  teamProgress,
  type ServiceChecklist,
} from "@/lib/domain/checklists";
import { eventDayLabel, eventTimeLabel, TIME_ZONE } from "@/lib/domain/schedule";
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
 * Service day (decision record 9, stage 2; approved mock, 2026-11-01), as IFC's checklist app
 * works (its US-02, US-05, US-09, US-10). Everyone sees every department, their own first; anyone
 * on the media team can help, scheduled or not. Whoever leads the service (such as the Technical
 * Director) can reset and undo. The team's progress is for everyone.
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

  const canTick = Boolean(data?.state.canTick && data.state.open);
  const team = teamProgress(data?.checklists ?? []);
  const today = sameDay(service.startsAt, new Date().toISOString());

  return (
    <div className="page-container flex flex-col gap-6 py-8 lg:py-12">
      {data ? <AutoRefresh /> : null}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-2">
          <Breadcrumbs
            items={[{ label: "Schedule", href: "/schedule" }, { label: service.title }]}
          />
          <p className="eyebrow">{today ? "Today's checklist" : "Service checklist"}</p>
          <h1 className="text-display font-semibold text-balance">{service.title}</h1>
          <div className="flex flex-wrap items-center gap-2.5 text-text-secondary">
            <span>
              {service.notPublished
                ? eventDayLabel(service.startsAt)
                : eventTimeLabel(service.startsAt, service.endsAt)}
              {service.location ? ` · ${service.location}` : ""}
            </span>
            {service.cancelled ? <StatusBadge tone="neutral">Cancelled</StatusBadge> : null}
            {data?.state.isScheduled ? (
              <StatusBadge tone="success">{servingLabel(data.state.myPositions)}</StatusBadge>
            ) : null}
          </div>
        </div>
        {data && team.total > 0 ? <TeamRing done={team.done} total={team.total} /> : null}
      </header>

      {service.notPublished && !service.cancelled ? <Notice>{NOT_PUBLISHED_NOTE}</Notice> : null}

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
          {data.state.open ? (
            <Notice>
              Ticking is open until twelve hours after the service. Everyone sees each tick within
              30 seconds.
              {!data.state.isScheduled && data.state.canTick && !data.state.seesAll
                ? " You're not on the schedule for this service, but you can still help."
                : ""}
            </Notice>
          ) : (
            <Notice>
              Ticking opens two days before the service and closes twelve hours after it. This is
              how the checklists stand.
            </Notice>
          )}

          <ServiceBoard
            checklists={boardOrder(data.checklists).map(toBoard)}
            eventId={service.id}
            canTick={canTick}
            action={setItemAction}
          />

          {data.state.canLead && data.state.open ? (
            <section
              aria-labelledby="lead-heading"
              className="flex max-w-2xl flex-col gap-3 rounded-card border border-border bg-surface p-5"
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

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-small text-text-secondary">
      <InfoIcon className="size-[18px] shrink-0 text-accent-light" />
      <span>{children}</span>
    </p>
  );
}

/** The team's progress across every department, as a ring with the numbers beside it. */
function TeamRing({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 15.5;
  const offset = circumference * (1 - percentDone(done, total) / 100);
  return (
    <div className="flex items-center gap-3.5">
      <svg aria-hidden="true" viewBox="0 0 36 36" className="size-13 -rotate-90 sm:size-16">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-hover" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-accent transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
        />
      </svg>
      <p className="flex flex-col">
        <span className="tabular text-heading font-semibold">
          {done} of {total}
        </span>
        <span className="text-small text-text-muted">done across the team</span>
      </p>
    </div>
  );
}

const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function sameDay(a: string, b: string): boolean {
  return DAY.format(new Date(a)) === DAY.format(new Date(b));
}

/** Tick times are formatted here, in Winnipeg time, so the server and browser agree. */
function toBoard(checklist: ServiceChecklist): BoardChecklist {
  return {
    id: checklist.id,
    name: checklist.name,
    departmentHue: checklist.departmentHue,
    isMine: checklist.isMine,
    done: checklist.done,
    total: checklist.total,
    sections: checklist.sections.map((section) => ({
      id: section.id,
      name: section.name,
      items: section.items.map((item) => ({
        ...item,
        checkedTime: item.checkedAt ? TIME.format(new Date(item.checkedAt)) : null,
      })),
    })),
  };
}

function ServeSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the checklists…" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-80 max-w-full" />
      </div>
      <div className="grid gap-7 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
