import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import { listPlanTemplates, type PlanTemplate } from "@/lib/data/plans";
import { getUpcomingEvents } from "@/lib/data/schedule";
import { listServiceTypes, type ServiceType } from "@/lib/data/service-types";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createEventAction } from "./actions";
import { createServiceAction } from "./plan-actions";
import { ScheduleTabs } from "./schedule-tabs";

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
  const [events, source] = await Promise.all([getUpcomingEvents(), getSchedulingSource()]);
  const [types, templates] =
    source === "academy" ? await Promise.all([listServiceTypes(), listPlanTemplates()]) : [[], []];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Schedule"
        description="Add services and rehearsals, then the positions they need. Each position is filled from its team in Serving teams. The Academy checks nobody is away that day or already serving in another position."
      />

      <ScheduleTabs current="upcoming" />

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

      {source === "academy" && types.length > 0 ? (
        <NewService types={types} templates={templates} />
      ) : null}

      {source === "academy" ? (
        <section
          aria-labelledby="new-event-heading"
          className="flex max-w-3xl flex-col gap-4 rounded-card border border-border bg-surface p-5"
        >
          <h2 id="new-event-heading" className="text-subheading font-semibold">
            Add a one-off event
          </h2>
          <p className="text-small text-text-secondary">
            For regular services, set up a service type once and create its dates in one step.
          </p>
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
                <input
                  id="event-end"
                  name="endTime"
                  type="time"
                  required
                  className={fieldClasses}
                />
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
      ) : null}
    </div>
  );
}

/**
 * One service on a day: its type brings the positions, times, and reminder; its plan brings the
 * order of service. Any plan can go with any type.
 */
function NewService({ types, templates }: { types: ServiceType[]; templates: PlanTemplate[] }) {
  return (
    <section
      aria-labelledby="new-service-heading"
      className="flex max-w-3xl flex-col gap-4 rounded-card border border-border bg-surface p-5"
    >
      <h2 id="new-service-heading" className="text-subheading font-semibold">
        New service
      </h2>
      <ActionForm
        action={createServiceAction}
        submitLabel="Create service"
        pendingLabel="Creating…"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="service-day" label="Day">
            <input id="service-day" name="date" type="date" required className={fieldClasses} />
          </Field>
          <Field id="service-type" label="Service type">
            <select id="service-type" name="typeId" className={fieldClasses}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="service-plan" label="Plan">
            <select id="service-plan" name="templateId" className={fieldClasses}>
              <option value="">The type&apos;s usual plan</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-small text-text-muted">
          The service type sets the positions, time, and reminder. The plan sets the order of
          service: a Holy Communion Service can use the Standard Sunday plan, or the other way
          round.
        </p>
      </ActionForm>
    </section>
  );
}
