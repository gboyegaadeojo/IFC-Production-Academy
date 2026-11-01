import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
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
  parseDate,
  parseMonth,
  winnipegDate,
} from "@/lib/domain/month-calendar";
import {
  ASSIGNMENT_STATUS_LABELS,
  eventTimeLabel,
  READINESS_LABELS,
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

export default function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * "My Schedule" (SPEC §8, decision record 9): a month calendar to tap a day and see where you're
 * serving and who with, upcoming assignments to confirm or decline, and days you're away.
 */
async function ScheduleContent({ searchParams }: Pick<PageProps<"/schedule">, "searchParams">) {
  const user = await requireActiveUser();
  const params = await searchParams;
  const today = winnipegDate(new Date());
  const selected = parseDate(params.day);
  const month = parseMonth(params.month, (selected ?? today).slice(0, 7));
  const range = gridRange(month);
  const [assignments, away, inMonth, coverRequests, openSpots, myRequests] = await Promise.all([
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
  ]);

  const marks = new Map<string, DayMark[]>();
  for (const assignment of inMonth) {
    if (assignment.status === "declined") {
      continue;
    }
    const date = winnipegDate(assignment.event.startsAt);
    marks.set(date, [
      ...(marks.get(date) ?? []),
      {
        label:
          assignment.status === "confirmed"
            ? `Serving: ${assignment.roleName}`
            : `Asked to serve: ${assignment.roleName}`,
        tone: assignment.status === "confirmed" ? "serving" : "pending",
      },
    ]);
  }
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    if (isAway(date, away)) {
      marks.set(date, [...(marks.get(date) ?? []), { label: "Away", tone: "away" }]);
    }
  }
  const query = (next: { month: string; day?: string | null }) => {
    const search = new URLSearchParams({ month: next.month });
    if (next.day) {
      search.set("day", next.day);
    }
    return `/schedule?${search.toString()}`;
  };

  return (
    <div className="page-container flex flex-col gap-10 py-8 lg:py-12">
      <PageHeader
        title="Your schedule"
        description="Where you're serving next. Confirm each one, or ask a teammate to cover if you can't make it."
      />

      <section aria-label="Calendar" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <MonthCalendar
          month={month}
          today={today}
          selected={selected}
          marks={marks}
          hrefFor={(date) => query({ month: date.slice(0, 7), day: date })}
          monthHref={(next) => query({ month: next })}
        />
        {selected ? (
          <DayPanel
            date={selected}
            assignments={inMonth.filter(
              (a) => a.status !== "declined" && winnipegDate(a.event.startsAt) === selected,
            )}
            away={isAway(selected, away)}
          />
        ) : (
          <p className="text-small text-text-muted lg:pt-12">
            Tap a day to see where you&apos;re serving and who&apos;s serving with you.
          </p>
        )}
      </section>

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="upcoming-heading" className="text-heading font-semibold">
            Coming up
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
          <EmptyState title="Nothing scheduled">
            When a leader schedules you for a service, it shows up here for you to confirm.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{assignment.event.title}</span>
                    <StatusBadge tone={assignment.status === "confirmed" ? "success" : "pending"}>
                      {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                    </StatusBadge>
                  </div>
                  <span className="text-small text-text-secondary">
                    {eventTimeLabel(assignment.event.startsAt, assignment.event.endsAt)}
                    {assignment.event.location ? ` · ${assignment.event.location}` : ""}
                  </span>
                  <span className="text-small text-text-muted">
                    {assignment.roleName} · {assignment.departmentName}
                    {assignment.readiness === "supervised"
                      ? ` · ${READINESS_LABELS.supervised} you`
                      : ""}
                  </span>
                </div>
                {assignment.status !== "declined" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/serve/${assignment.event.id}`}
                      className="flex min-h-control items-center px-1 text-small font-medium text-accent-light underline-offset-4 hover:underline"
                    >
                      Checklist<span className="sr-only"> for {assignment.event.title}</span>
                    </Link>
                    {assignment.status === "pending" ? (
                      <ActionForm
                        action={respondAction}
                        submitLabel="Confirm"
                        pendingLabel="Saving…"
                        hidden={{ assignmentId: assignment.id, response: "confirmed" }}
                        srLabel={assignment.event.title}
                        className="flex"
                      />
                    ) : null}
                    {assignment.status === "pending" ? (
                      <ActionForm
                        action={respondAction}
                        submitLabel="Decline"
                        pendingLabel="Saving…"
                        variant="secondary"
                        hidden={{ assignmentId: assignment.id, response: "declined" }}
                        srLabel={assignment.event.title}
                        className="flex"
                      />
                    ) : null}
                  </div>
                ) : null}
                {assignment.status !== "declined" ? (
                  <CoverControls
                    assignmentId={assignment.id}
                    title={assignment.event.title}
                    requestId={myRequests.get(assignment.id) ?? null}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {coverRequests.length > 0 ? (
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

      {openSpots.length > 0 ? (
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
                  <span className="font-medium">
                    {entry.startsOn === entry.endsOn
                      ? formatDate(`${entry.startsOn}T12:00:00Z`)
                      : `${formatDate(`${entry.startsOn}T12:00:00Z`)} to ${formatDate(`${entry.endsOn}T12:00:00Z`)}`}
                  </span>
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
}: {
  date: string;
  assignments: MyAssignment[];
  away: boolean;
}) {
  const teams = await Promise.all(assignments.map((a) => getEventTeam(a.event.id)));
  return (
    <section
      aria-labelledby="day-heading"
      className="flex flex-col gap-4 rounded-card border border-border p-5 lg:mt-12"
    >
      <h2 id="day-heading" className="text-subheading font-semibold">
        {dayLabel(date)}
      </h2>
      {away ? <StatusBadge tone="neutral">You&apos;re away</StatusBadge> : null}
      {assignments.length === 0 ? (
        <p className="text-small text-text-secondary">You&apos;re not serving this day.</p>
      ) : (
        assignments.map((assignment, index) => (
          <div key={assignment.id} className="flex flex-col gap-2">
            <p className="font-medium">{assignment.event.title}</p>
            <p className="text-small text-text-secondary">
              {eventTimeLabel(assignment.event.startsAt, assignment.event.endsAt)}
              {assignment.event.location ? ` · ${assignment.event.location}` : ""}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-small">
              <span>
                You: {assignment.roleName} · {assignment.departmentName}
              </span>
              <StatusBadge tone={assignment.status === "confirmed" ? "success" : "pending"}>
                {ASSIGNMENT_STATUS_LABELS[assignment.status]}
              </StatusBadge>
            </p>
            <Link
              href={`/serve/${assignment.event.id}`}
              className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
            >
              Open the pre-service checklist
            </Link>
            {(teams[index] ?? []).length > 0 ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-small font-medium text-text-muted">Serving with you</h3>
                <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                  {(teams[index] ?? []).map((slot) => (
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
              </div>
            ) : null}
          </div>
        ))
      )}
    </section>
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
