import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { refreshAction } from "@/app/(app)/admin/planning-center/actions";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { CalendarRangeIcon, CheckIcon, PlaneIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import {
  getPcoLastSynced,
  getSchedulingSource,
  pcoRefreshEnabled,
} from "@/lib/data/planning-center";
import { canOpenAdminSection } from "@/lib/domain/admin";
import { MonthCalendar, type DayMark } from "@/components/ui/month-calendar";
import {
  getCoverRequestsForMe,
  getEventTeam,
  getMyAssignmentsBetween,
  getMyOpenCoverRequests,
  getMyOpenSpots,
  getMyUnavailability,
  getMyUpcomingAssignments,
  type MyAssignment,
} from "@/lib/data/schedule";
import { formatDate } from "@/lib/domain/dates";
import {
  addDays,
  dayLabel,
  gridRange,
  isAway,
  monthLabel,
  parseDate,
  parseMonth,
  shiftMonth,
  winnipegDate,
} from "@/lib/domain/month-calendar";
import {
  eventTimeLabel,
  READINESS_LABELS,
  SERVING_LABELS,
  syncedAgo,
  winnipegToUtc,
} from "@/lib/domain/schedule";
import {
  addUnavailabilityAction,
  removeUnavailabilityAction,
  requestCoverAction,
  respondAction,
  signUpAction,
  takeCoverAction,
  withdrawCoverAction,
} from "./actions";

export const metadata: Metadata = { title: "Your schedule" };

/** Where volunteers reply and block out dates while Planning Center schedules. */
const PLANNING_CENTER_URL = "https://services.planningcenteronline.com";

export default function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * "My Schedule" (SPEC §8, decision record 9; redesigned 2026-11-01 from G's approved mock): a
 * large month board to tap a day, the day's details with what to do next, upcoming assignments,
 * and days away. While Planning Center schedules, replies and blockouts happen there.
 */
async function ScheduleContent({ searchParams }: Pick<PageProps<"/schedule">, "searchParams">) {
  const user = await requireActiveUser();
  const params = await searchParams;
  const today = winnipegDate(new Date());
  const picked = parseDate(params.day);
  const selected = picked ?? today;
  const month = parseMonth(params.month, (picked ?? today).slice(0, 7));
  const range = gridRange(month);
  const [
    source,
    assignments,
    away,
    inMonth,
    coverRequests,
    openSpots,
    myRequests,
    lastSynced,
    grants,
  ] = await Promise.all([
    getSchedulingSource(),
    getMyUpcomingAssignments(user.id),
    getMyUnavailability(user.id),
    getMyAssignmentsBetween(
      user.id,
      (winnipegToUtc(range.from, "00:00") ?? new Date()).toISOString(),
      (winnipegToUtc(addDays(range.to, 1), "00:00") ?? new Date()).toISOString(),
    ),
    getCoverRequestsForMe(),
    getMyOpenSpots(),
    getMyOpenCoverRequests(user.id),
    getPcoLastSynced(),
    getMyCapabilities(),
  ]);

  const pco = source === "planning_center";
  const canRefresh = pco && pcoRefreshEnabled() && canOpenAdminSection(grants, "planning-center");
  const marks = new Map<string, DayMark[]>();
  for (const assignment of inMonth) {
    const date = winnipegDate(assignment.event.startsAt);
    marks.set(date, [
      ...(marks.get(date) ?? []),
      {
        label: `${servingLabel(assignment.status)} · ${assignment.roleName}`,
        tone:
          assignment.status === "confirmed"
            ? "serving"
            : assignment.status === "declined"
              ? "declined"
              : "pending",
      },
    ]);
  }
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    if (isAway(date, away)) {
      marks.set(date, [...(marks.get(date) ?? []), { label: "Blocked", tone: "away" }]);
    }
  }
  const query = (next: { month: string; day?: string | null }) => {
    const search = new URLSearchParams({ month: next.month });
    if (next.day) {
      search.set("day", next.day);
    }
    return `/schedule?${search.toString()}`;
  };
  const upcomingAway = away.filter((entry) => entry.endsOn >= today);

  return (
    <div className="page-container flex flex-col gap-10 py-8 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Your workspace</p>
          <h1 className="text-[clamp(2.25rem,4vw,3.25rem)] leading-none font-bold tracking-[-0.035em]">
            Schedule
          </h1>
          <p className="max-w-[60ch] text-body text-text-secondary">
            {pco
              ? "Your serving schedule, upcoming services, and time away, all in one place."
              : "Where you're serving next. Confirm each one, or ask a teammate to cover if you can't make it."}
          </p>
          {pco ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-text-secondary">
              <span className="flex items-center gap-2 text-text">
                <CheckIcon className="size-4 text-success" />
                Planning Center connected
              </span>
              {lastSynced ? (
                <>
                  <span aria-hidden="true" className="h-4 w-px bg-border" />
                  <span>Last synced {syncedAgo(lastSynced)}</span>
                </>
              ) : null}
              {canRefresh ? (
                <ActionForm
                  action={refreshAction}
                  submitLabel="Refresh"
                  pendingLabel="Asking…"
                  variant="tertiary"
                  className="flex items-center gap-2"
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <nav aria-label="Change month" className="flex flex-wrap items-center gap-2">
          <MonthLink href={query({ month: shiftMonth(month, -1) })} label="Previous month">
            ‹
          </MonthLink>
          <span
            aria-live="polite"
            className="flex min-h-11 min-w-44 items-center justify-center rounded-button border border-border bg-surface px-4 text-body font-medium"
          >
            {monthLabel(month)}
          </span>
          <MonthLink href={query({ month: shiftMonth(month, 1) })} label="Next month">
            ›
          </MonthLink>
          <MonthLink href={query({ month: today.slice(0, 7), day: today })}>Today</MonthLink>
        </nav>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label="Calendar" className="flex flex-col gap-4">
          <MonthCalendar
            month={month}
            today={today}
            selected={selected}
            marks={marks}
            hrefFor={(date) => query({ month: date.slice(0, 7), day: date })}
            monthHref={(next) => query({ month: next })}
            variant="board"
            showNav={false}
          />
          <ul
            aria-label="Key"
            className="flex flex-wrap gap-x-5 gap-y-2 text-small text-text-secondary"
          >
            {KEY.map(([tone, label]) => (
              <li key={tone} className="flex items-center gap-2">
                <span aria-hidden="true" className={`size-2 rounded-pill ${KEY_DOT[tone]}`} />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <aside
          aria-label="Day and upcoming"
          className="flex flex-col gap-8 lg:border-l lg:border-border lg:pl-8"
        >
          <DayPanel
            date={selected}
            assignments={inMonth.filter((a) => winnipegDate(a.event.startsAt) === selected)}
            away={isAway(selected, away)}
            pco={pco}
            myRequests={myRequests}
          />

          <section aria-labelledby="upcoming-heading" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="upcoming-heading" className="text-subheading font-semibold">
                Upcoming assignments
              </h2>
              {assignments.some((a) => a.status !== "declined") ? (
                <a
                  href="/schedule/calendar"
                  download
                  className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
                >
                  Add to your calendar (.ics)
                </a>
              ) : null}
            </div>
            {assignments.length === 0 ? (
              <p className="text-small text-text-secondary">
                Nothing scheduled yet. When you&apos;re scheduled, it shows up here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {assignments.map((assignment) => {
                  const date = winnipegDate(assignment.event.startsAt);
                  return (
                    <li key={assignment.id}>
                      <Link
                        href={query({ month: date.slice(0, 7), day: date })}
                        scroll={false}
                        className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-button py-3 transition-surface hover:bg-card"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-11 items-center justify-center rounded-button border border-border bg-card text-text-secondary"
                        >
                          <CalendarRangeIcon className="size-5" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{assignment.event.title}</span>
                          <span className="text-small text-text-secondary">
                            {eventTimeLabel(assignment.event.startsAt, assignment.event.endsAt)}
                          </span>
                          <span className="truncate text-small text-text-muted">
                            {assignment.roleName} – {assignment.departmentName}
                          </span>
                        </span>
                        <AssignmentBadge status={assignment.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {pco ? (
            <section
              aria-labelledby="blocked-heading"
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center"
            >
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-button bg-card text-text-secondary"
              >
                <PlaneIcon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 id="blocked-heading" className="font-semibold">
                  Blocked dates
                </h2>
                {upcomingAway.length === 0 ? (
                  <p className="text-small text-text-secondary">None coming up.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {upcomingAway.map((entry) => (
                      <li key={entry.id} className="text-small">
                        <span className="font-medium">
                          {awayLabel(entry.startsOn, entry.endsOn)}
                        </span>
                        {entry.note ? (
                          <span className="block text-text-secondary">{entry.note}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <a
                href={PLANNING_CENTER_URL}
                target="_blank"
                rel="noreferrer"
                className="col-start-2 text-small font-medium text-accent-light underline-offset-4 hover:underline sm:col-start-auto sm:border-l sm:border-border sm:pl-4"
              >
                Manage in Planning Center
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </section>
          ) : null}
        </aside>
      </div>

      {!pco && coverRequests.length > 0 ? (
        <section aria-labelledby="cover-heading" className="flex flex-col gap-3">
          <h2 id="cover-heading" className="text-heading font-semibold">
            Can you cover?
          </h2>
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {coverRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium">
                    {request.roleName} · {request.event.title}
                  </span>
                  <span className="text-small text-text-secondary">
                    {eventTimeLabel(request.event.startsAt, request.event.endsAt)}
                  </span>
                  <span className="text-small text-text-muted">
                    {request.note
                      ? `${request.requestedBy} can't make it: “${request.note}”`
                      : `${request.requestedBy} can't make it.`}
                  </span>
                </span>
                <ActionForm
                  action={takeCoverAction}
                  submitLabel="I'll cover it"
                  pendingLabel="Saving…"
                  hidden={{ requestId: request.id }}
                  srLabel={`${request.roleName}, ${request.event.title}`}
                  className="flex"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!pco && openSpots.length > 0 ? (
        <section aria-labelledby="spots-heading" className="flex flex-col gap-3">
          <h2 id="spots-heading" className="text-heading font-semibold">
            Open spots
          </h2>
          <p className="max-w-3xl text-small text-text-secondary">
            Positions on your teams that still need someone, on days you&apos;re free.
          </p>
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {openSpots.map((spot) => (
              <li
                key={spot.positionId}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium">
                    {spot.roleName} · {spot.event.title}
                  </span>
                  <span className="text-small text-text-secondary">
                    {eventTimeLabel(spot.event.startsAt, spot.event.endsAt)}
                    {spot.event.location ? ` · ${spot.event.location}` : ""}
                  </span>
                </span>
                <ActionForm
                  action={signUpAction}
                  submitLabel="Sign up"
                  pendingLabel="Signing up…"
                  variant="secondary"
                  hidden={{ positionId: spot.positionId }}
                  srLabel={`${spot.roleName}, ${spot.event.title}`}
                  className="flex"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pco ? null : (
        <section aria-labelledby="away-heading" className="flex flex-col gap-3">
          <h2 id="away-heading" className="text-heading font-semibold">
            Days you&apos;re away
          </h2>
          <p className="max-w-3xl text-small text-text-secondary">
            Leaders won&apos;t be able to schedule you on these days without overriding it.
          </p>
          {away.length > 0 ? (
            <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
              {away.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{awayLabel(entry.startsOn, entry.endsOn)}</span>
                    {entry.note ? (
                      <span className="text-small text-text-muted">{entry.note}</span>
                    ) : null}
                  </span>
                  <ActionForm
                    action={removeUnavailabilityAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="tertiary"
                    hidden={{ id: entry.id }}
                    className="flex"
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="max-w-3xl rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={addUnavailabilityAction}
              submitLabel="Add days away"
              pendingLabel="Saving…"
              variant="secondary"
              className="flex flex-col gap-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="away-from" label="From">
                  <input
                    id="away-from"
                    name="startsOn"
                    type="date"
                    required
                    className={fieldClasses}
                  />
                </Field>
                <Field id="away-to" label="To (optional)">
                  <input id="away-to" name="endsOn" type="date" className={fieldClasses} />
                </Field>
              </div>
              <Field id="away-note" label="Note (optional)">
                <input id="away-note" name="note" maxLength={200} className={fieldClasses} />
              </Field>
            </ActionForm>
          </div>
        </section>
      )}
    </div>
  );
}

/** Ask a teammate to cover, or withdraw the request. */
function CoverControls({
  assignmentId,
  title,
  requestId,
}: {
  assignmentId: string;
  title: string;
  requestId: string | null;
}) {
  if (requestId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="pending">Cover requested</StatusBadge>
        <ActionForm
          action={withdrawCoverAction}
          submitLabel="Withdraw"
          pendingLabel="Saving…"
          variant="tertiary"
          hidden={{ requestId }}
          srLabel={`cover request for ${title}`}
          className="flex"
        />
      </div>
    );
  }
  return (
    <details>
      <summary className="flex min-h-control cursor-pointer items-center text-small text-accent-light">
        Can&apos;t make it? Ask for cover<span className="sr-only"> for {title}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <ActionForm
          action={requestCoverAction}
          submitLabel="Ask for cover"
          pendingLabel="Asking…"
          variant="secondary"
          hidden={{ assignmentId }}
          className="flex flex-col gap-3"
        >
          <Field id={`cover-note-${assignmentId}`} label="Note (optional)">
            <input
              id={`cover-note-${assignmentId}`}
              name="note"
              maxLength={300}
              className={fieldClasses}
            />
          </Field>
        </ActionForm>
        <p className="text-small text-text-muted">
          Teammates who are free that day are asked. You stay scheduled until someone takes it.
        </p>
      </div>
    </details>
  );
}

async function DayPanel({
  date,
  assignments,
  away,
  pco,
  myRequests,
}: {
  date: string;
  assignments: MyAssignment[];
  away: boolean;
  pco: boolean;
  myRequests: ReadonlyMap<string, string>;
}) {
  const active = assignments.filter((a) => a.status !== "declined");
  const teams = await Promise.all(active.map((a) => getEventTeam(a.event.id)));
  const [weekday, ...rest] = dayLabel(date).split(", ");
  return (
    <section aria-labelledby="day-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{weekday}</p>
        <h2 id="day-heading" className="text-[2rem] leading-tight font-semibold tracking-[-0.03em]">
          {rest.join(", ")}, {date.slice(0, 4)}
        </h2>
        <div className="flex flex-wrap gap-2">
          {away ? <StatusBadge tone="locked">Blocked</StatusBadge> : null}
          {assignments.length === 0 && !away ? (
            <StatusBadge tone="neutral">No assignment</StatusBadge>
          ) : null}
        </div>
        {assignments.length === 0 ? (
          <p className="text-small text-text-secondary">
            {away
              ? "You're away this day, so you won't be scheduled."
              : "You're not serving this day."}
          </p>
        ) : null}
      </div>
      {assignments.map((assignment) => {
        const team = teams[active.indexOf(assignment)] ?? [];
        const asked = assignment.status === "pending";
        return (
          <article
            key={assignment.id}
            className={`flex flex-col gap-3 rounded-card border p-4 ${
              asked ? "border-warning/50 bg-warning/5" : "border-border bg-surface"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col">
                <h3 className="font-semibold">{assignment.event.title}</h3>
                <p className="text-small text-text-secondary">
                  {eventTimeLabel(assignment.event.startsAt, assignment.event.endsAt)}
                  {assignment.event.location ? ` · ${assignment.event.location}` : ""}
                </p>
                <p className="text-small text-text-muted">
                  {assignment.roleName} · {assignment.departmentName}
                  {assignment.readiness === "supervised"
                    ? ` · ${READINESS_LABELS.supervised} you`
                    : ""}
                </p>
              </div>
              <AssignmentBadge status={assignment.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {asked && pco ? (
                <a
                  href={PLANNING_CENTER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClasses("primary")}
                >
                  Accept or decline in Planning Center
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
              {asked && !pco ? (
                <>
                  <ActionForm
                    action={respondAction}
                    submitLabel="Confirm"
                    pendingLabel="Saving…"
                    hidden={{ assignmentId: assignment.id, response: "confirmed" }}
                    srLabel={assignment.event.title}
                    className="flex"
                  />
                  <ActionForm
                    action={respondAction}
                    submitLabel="Decline"
                    pendingLabel="Saving…"
                    variant="secondary"
                    hidden={{ assignmentId: assignment.id, response: "declined" }}
                    srLabel={assignment.event.title}
                    className="flex"
                  />
                </>
              ) : null}
              {assignment.status !== "declined" ? (
                <Link
                  href={`/serve/${assignment.event.id}`}
                  className={buttonClasses(asked ? "secondary" : "primary")}
                >
                  Open checklist<span className="sr-only"> for {assignment.event.title}</span>
                </Link>
              ) : null}
              {pco && !asked ? (
                <a
                  href={PLANNING_CENTER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-control items-center px-1 text-small font-medium text-accent-light underline-offset-4 hover:underline"
                >
                  Change in Planning Center
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>
            {!pco && assignment.status !== "declined" ? (
              <CoverControls
                assignmentId={assignment.id}
                title={assignment.event.title}
                requestId={myRequests.get(assignment.id) ?? null}
              />
            ) : null}
            {team.length > 0 ? (
              <details className="group">
                <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
                  Who&apos;s serving with you ({team.length})
                </summary>
                <ul className="mt-2 flex flex-col divide-y divide-border rounded-button border border-border">
                  {team.map((slot) => (
                    <li
                      key={slot.positionId}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-small"
                    >
                      <span className="text-text-secondary">{slot.roleName}</span>
                      <span className={slot.name ? "text-text" : "text-text-muted"}>
                        {slot.name ?? "Open"}
                        {slot.status === "pending" ? " (not confirmed yet)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function servingLabel(status: MyAssignment["status"]): string {
  return status === "confirmed"
    ? SERVING_LABELS.confirmed
    : status === "declined"
      ? SERVING_LABELS.declined
      : SERVING_LABELS.pending;
}

function AssignmentBadge({ status }: { status: MyAssignment["status"] }) {
  return (
    <StatusBadge
      tone={status === "confirmed" ? "success" : status === "declined" ? "neutral" : "pending"}
    >
      {servingLabel(status)}
    </StatusBadge>
  );
}

const KEY = [
  ["serving", "Serving (confirmed)"],
  ["pending", "Asked to serve"],
  ["declined", "Declined"],
  ["away", "Blocked (away)"],
] as const;

const KEY_DOT: Record<(typeof KEY)[number][0], string> = {
  serving: "bg-success",
  pending: "bg-warning",
  declined: "ring-[1.5px] ring-warning ring-inset",
  away: "bg-error",
};

function awayLabel(startsOn: string, endsOn: string): string {
  const from = formatDate(`${startsOn}T12:00:00Z`);
  return startsOn === endsOn ? from : `${from} – ${formatDate(`${endsOn}T12:00:00Z`)}`;
}

function MonthLink({
  href,
  label,
  children,
}: {
  href: string;
  /** Only for symbols; visible words name the link themselves. */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      scroll={false}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-button border border-border bg-surface px-3 text-body text-text-secondary transition-surface hover:border-border-strong hover:text-text"
    >
      {children}
    </Link>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your schedule…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 max-w-3xl" />
    </div>
  );
}
