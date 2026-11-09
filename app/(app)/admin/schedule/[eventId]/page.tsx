import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import {
  getCandidates,
  getEventDetail,
  getOpenCoverRequestsForEvent,
  type EventDetail,
  type PositionDetail,
} from "@/lib/data/schedule";
import {
  assignmentStatusLabel,
  candidateLabel,
  eventTimeLabel,
  groupPlaces,
  type PositionGroup,
  READINESS_LABELS,
  utcToWinnipeg,
} from "@/lib/domain/schedule";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import {
  addPositionAction,
  assignAction,
  cancelAssignmentAction,
  cancelEventAction,
  removePositionAction,
  sendRequestsAction,
  updateEventAction,
  setSignupsAction,
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
 * One event (workflow D): positions by department, who's in each, and whether they're trained.
 * Only people on the position's team can be scheduled (decided 2026-10-31); training is shown,
 * with an optional trained person alongside. A second position that day, or a day away, needs
 * schedule.override and a reason.
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
  // While Planning Center schedules, services are read from there and can't be changed here.
  const academy = (await getSchedulingSource()) === "academy";
  const open =
    academy && !event.cancelled && new Date(event.endsAt).getTime() > new Date().getTime();
  const coverRequested = await getOpenCoverRequestsForEvent(event.id);

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
        {academy ? null : (
          <p className="max-w-2xl text-small text-text-secondary">
            Scheduled in Planning Center. Changes made there show here within 15 minutes.
          </p>
        )}
        {event.notes ? <p className="max-w-2xl text-small text-text-muted">{event.notes}</p> : null}
        {open ? (
          <div className="flex flex-wrap items-center gap-3 text-small text-text-secondary">
            <span>
              {event.signupsOpen
                ? "Sign-ups are open: team members can take open spots."
                : "Sign-ups are closed: only schedulers fill positions."}
            </span>
            <ActionForm
              action={setSignupsAction}
              submitLabel={event.signupsOpen ? "Close sign-ups" : "Open sign-ups"}
              pendingLabel="Saving…"
              variant="tertiary"
              hidden={{ eventId: event.id, open: event.signupsOpen ? "false" : "true" }}
              className="flex"
            />
          </div>
        ) : null}
      </header>

      {open ? <SendRequests eventId={event.id} positions={event.positions} /> : null}

      <section aria-labelledby="positions-heading" className="flex flex-col gap-4">
        <h2 id="positions-heading" className="text-heading font-semibold">
          Positions
        </h2>
        {event.positions.length === 0 ? (
          <EmptyState title="No positions yet">
            Add the positions this service needs. A position can need more than one person.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-4">
            {groupPlaces(event.positions).map((group) => (
              <PositionGroupCard
                key={group.roleId}
                group={group}
                eventId={event.id}
                open={open}
                coverRequested={coverRequested}
              />
            ))}
          </ul>
        )}
        {open && event.roles.length > 0 ? (
          <div className="max-w-3xl rounded-card border border-border bg-surface p-5">
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

      {open ? <EditEvent event={event} /> : null}

      {open ? (
        <details className="max-w-3xl rounded-card border border-border p-5">
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

/** One position on the service, with its places: "Camera 2, 1 of 2 filled". */
function PositionGroupCard({
  group,
  eventId,
  open,
  coverRequested,
}: {
  group: PositionGroup<PositionDetail>;
  eventId: string;
  open: boolean;
  coverRequested: ReadonlySet<string>;
}) {
  const canManage = group.places.some((place) => place.canManage);
  // The last place nobody has ever held can go, to need one fewer.
  const spare = [...group.places].reverse().find((place) => !place.assignment);
  const needed = group.places.length;
  return (
    <li className="flex flex-col rounded-card border border-border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card px-4 py-3">
        <p className="font-medium">
          {group.roleName}
          <span className="font-normal text-text-muted"> · {group.departmentName}</span>
        </p>
        <span className="text-small text-text-secondary tabular-nums">
          {group.filled} of {needed} filled
        </span>
        {open && canManage ? (
          <span className="ml-auto flex flex-wrap gap-2">
            <ActionForm
              action={addPositionAction}
              submitLabel="Need one more"
              pendingLabel="Adding…"
              variant="tertiary"
              hidden={{ eventId, roleId: group.roleId }}
              srLabel={group.roleName}
              className="flex"
            />
            {spare ? (
              <ActionForm
                action={removePositionAction}
                submitLabel={needed === 1 ? "Remove position" : "Need one fewer"}
                pendingLabel="Removing…"
                variant="tertiary"
                hidden={{ positionId: spare.id }}
                srLabel={group.roleName}
                className="flex"
              />
            ) : null}
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {group.places.map((place) => (
          <Place
            key={place.id}
            position={place}
            open={open}
            coverRequested={coverRequested.has(place.id)}
          />
        ))}
      </ul>
    </li>
  );
}

/** One place in a position: who holds it, any warning, and scheduling someone into it. */
async function Place({
  position,
  open,
  coverRequested,
}: {
  position: PositionDetail;
  open: boolean;
  coverRequested: boolean;
}) {
  const active =
    position.assignment &&
    (position.assignment.status === "pending" || position.assignment.status === "confirmed")
      ? position.assignment
      : null;
  const candidates = open && position.canManage && !active ? await getCandidates(position.id) : [];
  const supervisors = candidates.filter((c) => c.approved);

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      {active ? (
        <div className="flex flex-wrap items-center gap-2 text-small">
          <span className="font-medium">{active.name}</span>
          <StatusBadge
            tone={
              active.status === "confirmed" ? "success" : active.requestSent ? "pending" : "neutral"
            }
          >
            {assignmentStatusLabel(active)}
          </StatusBadge>
          <StatusBadge tone={active.readiness === "approved" ? "success" : "info"}>
            {READINESS_LABELS[active.readiness]}
          </StatusBadge>
          {coverRequested ? <StatusBadge tone="pending">Cover requested</StatusBadge> : null}
          {active.supervisorName ? (
            <span className="text-text-muted">Alongside: {active.supervisorName}</span>
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
      {active && (active.servingElsewhere || active.blockedOut) ? (
        <div
          role="note"
          className="flex flex-col gap-0.5 rounded-button border border-warning-line bg-warning-soft px-3 py-2 text-small"
        >
          <span className="font-medium">Conflict for {active.name}</span>
          {active.servingElsewhere ? (
            <span className="text-text-secondary">
              Also scheduled that day as {active.servingElsewhere}.
            </span>
          ) : null}
          {active.blockedOut ? (
            <span className="text-text-secondary">Blocked out: {active.blockedOut}.</span>
          ) : null}
          <span className="text-text-secondary">Nothing is blocked. Keep both or change one.</span>
        </div>
      ) : null}
      {active?.overrideReason ? (
        <p className="text-small text-text-secondary">Note: {active.overrideReason}</p>
      ) : null}

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
          <p className="text-small text-text-muted">
            Nobody is on the {position.roleName} team yet. Add people in{" "}
            <a href="/admin/teams" className="text-accent-light underline-offset-4 hover:underline">
              Serving teams
            </a>
            .
          </p>
        ) : (
          <details>
            <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-accent-light">
              Add someone<span className="sr-only"> as {position.roleName}</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <ActionForm
                action={assignAction}
                submitLabel="Add"
                pendingLabel="Adding…"
                hidden={{ positionId: position.id }}
              >
                <Field
                  id={`who-${position.id}`}
                  label="Volunteer"
                  hint="Only this position's team is listed. Someone already serving that day, or blocked out, can still be added, with a warning."
                >
                  <select
                    id={`who-${position.id}`}
                    name="userId"
                    aria-describedby={`who-${position.id}-hint`}
                    className={fieldClasses}
                  >
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidateLabel(candidate)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id={`supervisor-${position.id}`}
                  label="Someone alongside (optional)"
                  hint="If they're still learning, you can pair them with someone trained for this role."
                >
                  <select
                    id={`supervisor-${position.id}`}
                    name="supervisorId"
                    aria-describedby={`supervisor-${position.id}-hint`}
                    className={fieldClasses}
                  >
                    <option value="">Nobody</option>
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {supervisor.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
            </div>
          </details>
        )
      ) : null}
    </li>
  );
}

/** Everyone added but not asked yet, to send their requests in one go. */
function SendRequests({ eventId, positions }: { eventId: string; positions: PositionDetail[] }) {
  const unsent = positions.flatMap((position) =>
    position.canManage &&
    position.assignment?.status === "pending" &&
    !position.assignment.requestSent
      ? [{ assignment: position.assignment, roleName: position.roleName }]
      : [],
  );
  if (unsent.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="send-heading"
      className="flex max-w-3xl flex-col gap-3 rounded-card border border-accent bg-surface p-5"
    >
      <h2 id="send-heading" className="text-heading font-semibold">
        Send requests
      </h2>
      <p className="text-text-secondary">
        {unsent.length === 1 ? "1 person hasn't" : `${unsent.length} people haven't`} been asked
        yet. Each person gets one email for everything they&apos;re on at this service, and can
        accept or decline. Untick anyone you want to hold back.
      </p>
      <ActionForm
        action={sendRequestsAction}
        submitLabel="Send requests"
        pendingLabel="Sending…"
        hidden={{ eventId }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Who to ask</legend>
          {unsent.map(({ assignment, roleName }) => (
            <label key={assignment.id} className="flex min-h-control items-center gap-3">
              <input
                type="checkbox"
                name="assignmentIds"
                value={assignment.id}
                defaultChecked
                className="size-5"
              />
              <span>
                {assignment.name}
                <span className="text-text-muted"> · {roleName}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field id="send-message" label="Add a message (optional)">
          <textarea
            id="send-message"
            name="message"
            rows={2}
            maxLength={500}
            placeholder="For example: rehearsal starts 15 minutes early this week."
            className={`${fieldClasses} py-3`}
          />
        </Field>
      </ActionForm>
    </section>
  );
}

/** The service's name, day, times, location, and notes. Moving it emails everyone on it. */
function EditEvent({ event }: { event: EventDetail }) {
  const [date, start] = utcToWinnipeg(event.startsAt);
  const [, end] = utcToWinnipeg(event.endsAt);
  return (
    <details className="max-w-3xl rounded-card border border-border p-5">
      <summary className="flex min-h-control cursor-pointer items-center font-medium">
        Edit details
      </summary>
      <div className="mt-3">
        <ActionForm
          action={updateEventAction}
          submitLabel="Save"
          pendingLabel="Saving…"
          hidden={{ eventId: event.id }}
        >
          <Field id="edit-title" label="Name">
            <input
              id="edit-title"
              name="title"
              required
              maxLength={120}
              defaultValue={event.title}
              className={fieldClasses}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="edit-date" label="Date">
              <input
                id="edit-date"
                name="date"
                type="date"
                required
                defaultValue={date}
                className={fieldClasses}
              />
            </Field>
            <Field id="edit-start" label="Starts">
              <input
                id="edit-start"
                name="startTime"
                type="time"
                required
                defaultValue={start}
                className={fieldClasses}
              />
            </Field>
            <Field id="edit-end" label="Ends">
              <input
                id="edit-end"
                name="endTime"
                type="time"
                required
                defaultValue={end}
                className={fieldClasses}
              />
            </Field>
          </div>
          <p className="text-small text-text-muted">
            Times are Winnipeg time. If the day or start time changes, everyone on it gets a short
            email.
          </p>
          <Field id="edit-location" label="Location (optional)">
            <input
              id="edit-location"
              name="location"
              maxLength={120}
              defaultValue={event.location}
              className={fieldClasses}
            />
          </Field>
          <Field id="edit-notes" label="Notes (optional)">
            <textarea
              id="edit-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              defaultValue={event.notes}
              className={`${fieldClasses} py-3`}
            />
          </Field>
        </ActionForm>
      </div>
    </details>
  );
}
