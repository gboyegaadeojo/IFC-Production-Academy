import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getUpcomingEvents } from "@/lib/data/schedule";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createEventAction } from "./actions";

export const metadata: Metadata = { title: "Schedule" };

export default function AdminSchedulePage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the schedule…" />}>
      <AdminScheduleContent />
    </Suspense>
  );
}

/** Upcoming services and rehearsals, and how many positions are filled (SRS-SCHED-001). */
async function AdminScheduleContent() {
  const { allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const events = await getUpcomingEvents();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Schedule"
        description="Add services and rehearsals, then the positions they need. Each position is filled from its team in Serving teams. The Academy checks nobody is away that day or already serving in another position."
      />

      <section aria-labelledby="events-heading" className="flex flex-col gap-3">
        <h2 id="events-heading" className="text-heading font-semibold">
          Coming up
        </h2>
        {events.length === 0 ? (
          <EmptyState title="No events yet">Add the next service below.</EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/admin/schedule/${event.id}`}
                  className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-text">{event.title}</span>
                    <span className="text-small text-text-muted">
                      {eventTimeLabel(event.startsAt, event.endsAt)}
                      {event.location ? ` · ${event.location}` : ""}
                    </span>
                  </span>
                  {event.cancelled ? (
                    <StatusBadge tone="neutral">Cancelled</StatusBadge>
                  ) : (
                    <StatusBadge
                      tone={
                        event.positions > 0 && event.filled === event.positions
                          ? "success"
                          : "pending"
                      }
                    >
                      {event.positions === 0
                        ? "No positions yet"
                        : `${event.filled} of ${event.positions} filled`}
                    </StatusBadge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="new-event-heading"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-dashed border-border p-5"
      >
        <h2 id="new-event-heading" className="text-subheading font-semibold">
          Add an event
        </h2>
        <ActionForm action={createEventAction} submitLabel="Add event" pendingLabel="Adding…">
          <Field id="event-title" label="Name">
            <input
              id="event-title"
              name="title"
              required
              maxLength={120}
              placeholder="Sunday service"
              className={fieldClasses}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="event-date" label="Date">
              <input id="event-date" name="date" type="date" required className={fieldClasses} />
            </Field>
            <Field id="event-start" label="Starts">
              <input
                id="event-start"
                name="startTime"
                type="time"
                required
                className={fieldClasses}
              />
            </Field>
            <Field id="event-end" label="Ends">
              <input id="event-end" name="endTime" type="time" required className={fieldClasses} />
            </Field>
          </div>
          <p className="text-small text-text-muted">Times are Winnipeg time.</p>
          <Field id="event-location" label="Location (optional)">
            <input id="event-location" name="location" maxLength={120} className={fieldClasses} />
          </Field>
          <Field id="event-notes" label="Notes (optional)">
            <textarea
              id="event-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              className={`${fieldClasses} py-3`}
            />
          </Field>
        </ActionForm>
      </section>
    </div>
  );
}
