import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCandidates, getEventDetail, type PositionDetail } from "@/lib/data/schedule";
import { hasCapability } from "@/lib/domain/capabilities";
import {
  ASSIGNMENT_STATUS_LABELS,
  candidateLabel,
  eventTimeLabel,
  READINESS_LABELS,
} from "@/lib/domain/schedule";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import {
  addPositionAction,
  assignAction,
  cancelAssignmentAction,
  cancelEventAction,
  removePositionAction,
} from "../actions";

export const metadata: Metadata = { title: "Event" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/schedule/[eventId]">;

export default function EventPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the event…" />}>
      <EventContent params={params} />
    </Suspense>
  );
}

/**
 * One event (workflow D): positions by department, who's in each, and the check result. Leaders
 * schedule people who are Approved to Serve, or on supervised practice with a named approved
 * supervisor; anything else needs schedule.override and a reason (SRS-COMP-005..008).
 */
async function EventContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { eventId } = await params;
  if (!UUID.test(eventId)) {
    notFound();
  }
  const event = await getEventDetail(eventId, grants);
  if (!event) {
    notFound();
  }
  const open = !event.cancelled && new Date(event.endsAt).getTime() > new Date().getTime();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[{ label: "Schedule", href: "/admin/schedule" }, { label: event.title }]}
        />
        <h1 className="text-title font-semibold">{event.title}</h1>
        <p className="text-text-secondary">
          {eventTimeLabel(event.startsAt, event.endsAt)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {event.cancelled ? <StatusBadge tone="neutral">Cancelled</StatusBadge> : null}
        {event.notes ? <p className="max-w-2xl text-small text-text-muted">{event.notes}</p> : null}
      </header>

      <section aria-labelledby="positions-heading" className="flex flex-col gap-4">
        <h2 id="positions-heading" className="text-heading font-semibold">
          Positions
        </h2>
        {event.positions.length === 0 ? (
          <EmptyState title="No positions yet">
            Add the roles this event needs, one position for each person.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {event.positions.map((position) => (
              <Position
                key={position.id}
                position={position}
                open={open}
                canOverride={hasCapability(grants, "schedule.override", position.departmentId)}
              />
            ))}
          </ul>
        )}
        {open && event.roles.length > 0 ? (
          <div className="max-w-3xl rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={addPositionAction}
              submitLabel="Add position"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ eventId: event.id }}
              className="flex flex-col gap-3"
            >
              <Field id="new-position-role" label="Role">
                <select id="new-position-role" name="roleId" className={fieldClasses}>
                  {event.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} ({role.departmentName})
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          </div>
        ) : open ? (
          <p className="text-small text-text-muted">
            Set up serving roles in Competencies and roles to add positions.
          </p>
        ) : null}
      </section>

      {open ? (
        <details className="max-w-2xl rounded-card border border-border p-5">
          <summary className="flex min-h-control cursor-pointer items-center font-medium">
            Cancel this event
          </summary>
          <p className="mt-2 text-text-secondary">
            Everyone scheduled is taken off it. The record is kept.
          </p>
          <div className="mt-3">
            <ActionForm
              action={cancelEventAction}
              submitLabel="Cancel event"
              pendingLabel="Cancelling…"
              variant="destructive"
              hidden={{ eventId: event.id }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

async function Position({
  position,
  open,
  canOverride,
}: {
  position: PositionDetail;
  open: boolean;
  canOverride: boolean;
}) {
  const active =
    position.assignment &&
    (position.assignment.status === "pending" || position.assignment.status === "confirmed")
      ? position.assignment
      : null;
  const candidates = open && position.canManage && !active ? await getCandidates(position.id) : [];
  const supervisors = candidates.filter((c) => c.approved);

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {position.roleName}
          <span className="font-normal text-text-muted"> · {position.departmentName}</span>
        </p>
        {active ? (
          <div className="flex flex-wrap items-center gap-2 text-small">
            <span>{active.name}</span>
            <StatusBadge tone={active.status === "confirmed" ? "success" : "pending"}>
              {ASSIGNMENT_STATUS_LABELS[active.status]}
            </StatusBadge>
            <StatusBadge tone={active.readiness === "approved" ? "success" : "info"}>
              {READINESS_LABELS[active.readiness]}
            </StatusBadge>
            {active.supervisorName ? (
              <span className="text-text-muted">Supervisor: {active.supervisorName}</span>
            ) : null}
          </div>
        ) : (
          <p className="text-small text-text-muted">
            Open
            {position.assignment?.status === "declined"
              ? ` · ${position.assignment.name} declined`
              : ""}
          </p>
        )}
        {active?.overrideReason ? (
          <p className="text-small text-text-secondary">Override reason: {active.overrideReason}</p>
        ) : null}
      </div>

      {open && position.canManage ? (
        active ? (
          <ActionForm
            action={cancelAssignmentAction}
            submitLabel="Take off this position"
            pendingLabel="Saving…"
            variant="tertiary"
            hidden={{ assignmentId: active.id }}
            srLabel={`${active.name}, ${position.roleName}`}
            className="flex"
          />
        ) : candidates.length === 0 ? (
          <p className="text-small text-text-muted">This department has no active members yet.</p>
        ) : (
          <details>
            <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-accent-light">
              Schedule someone<span className="sr-only"> as {position.roleName}</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <ActionForm
                action={assignAction}
                submitLabel="Schedule"
                pendingLabel="Checking…"
                hidden={{ positionId: position.id }}
              >
                <Field id={`who-${position.id}`} label="Volunteer">
                  <select id={`who-${position.id}`} name="userId" className={fieldClasses}>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidateLabel(candidate)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id={`supervisor-${position.id}`}
                  label="Supervisor (for supervised practice)"
                  hint="Only needed if they aren't approved for this role yet. The supervisor must be."
                >
                  <select
                    id={`supervisor-${position.id}`}
                    name="supervisorId"
                    aria-describedby={`supervisor-${position.id}-hint`}
                    className={fieldClasses}
                  >
                    <option value="">No supervisor</option>
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {supervisor.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {canOverride ? (
                  <Field
                    id={`override-${position.id}`}
                    label="Override reason (only if you must)"
                    hint="Lets you schedule someone who isn't approved, is already serving, or is away. Kept in the audit log."
                  >
                    <input
                      id={`override-${position.id}`}
                      name="overrideReason"
                      maxLength={300}
                      aria-describedby={`override-${position.id}-hint`}
                      className={fieldClasses}
                    />
                  </Field>
                ) : null}
              </ActionForm>
            </div>
          </details>
        )
      ) : null}

      {open && position.canManage && !position.assignment ? (
        <ActionForm
          action={removePositionAction}
          submitLabel="Remove position"
          pendingLabel="Removing…"
          variant="tertiary"
          hidden={{ positionId: position.id }}
          srLabel={position.roleName}
          className="flex"
        />
      ) : null}
    </li>
  );
}
