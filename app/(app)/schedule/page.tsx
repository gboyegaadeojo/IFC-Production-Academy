import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyUnavailability, getMyUpcomingAssignments } from "@/lib/data/schedule";
import { formatDate } from "@/lib/domain/dates";
import { ASSIGNMENT_STATUS_LABELS, eventTimeLabel, READINESS_LABELS } from "@/lib/domain/schedule";
import { addUnavailabilityAction, removeUnavailabilityAction, respondAction } from "./actions";

export const metadata: Metadata = { title: "Your schedule" };

export default function SchedulePage() {
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleContent />
    </Suspense>
  );
}

/** "My Schedule" (SPEC §8): upcoming assignments to confirm or decline, and days you're away. */
async function ScheduleContent() {
  const user = await requireActiveUser();
  const [assignments, away] = await Promise.all([
    getMyUpcomingAssignments(user.id),
    getMyUnavailability(user.id),
  ]);

  return (
    <div className="page-container flex flex-col gap-10 py-8 lg:py-12">
      <PageHeader
        title="Your schedule"
        description="Where you're serving next. Confirm each one, or decline in good time so your leader can find someone else."
      />

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
                      ? ` · ${READINESS_LABELS.supervised}, with a supervisor alongside you`
                      : ""}
                  </span>
                </div>
                {assignment.status !== "declined" ? (
                  <div className="flex flex-wrap gap-2">
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
                    <ActionForm
                      action={respondAction}
                      submitLabel="Decline"
                      pendingLabel="Saving…"
                      variant="secondary"
                      hidden={{ assignmentId: assignment.id, response: "declined" }}
                      srLabel={assignment.event.title}
                      className="flex"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

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

function ScheduleSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your schedule…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 max-w-3xl" />
    </div>
  );
}
