import "server-only";
import { peopleById, personFor } from "@/lib/data/admin/shared";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  toScheduleError,
  type AssignmentReadiness,
  type AssignmentStatus,
  type ScheduleError,
} from "@/lib/domain/schedule";

// Scheduling (SRS-SCHED-001..011). Every assignment goes through assign_to_position, which runs
// the competency, conflict, and availability checks in the database.

export type ScheduleResult = { ok: true } | { ok: false; error: ScheduleError };
type WithValue<T> = { ok: true; value: T } | { ok: false; error: ScheduleError };

function fail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: ScheduleError;
} {
  return { ok: false, error: toScheduleError(error) };
}

// ---------------------------------------------------------------------------
// Volunteers
// ---------------------------------------------------------------------------

export type MyAssignment = {
  id: string;
  status: AssignmentStatus;
  readiness: AssignmentReadiness;
  event: { id: string; title: string; startsAt: string; endsAt: string; location: string };
  roleName: string;
  departmentName: string;
};

/** The volunteer's upcoming assignments, soonest first (SRS-SCHED "personal schedule"). */
export async function getMyUpcomingAssignments(userId: string): Promise<MyAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const assignments = await supabase
    .from("event_assignments")
    .select("id, status, readiness, event_id, role_id, department_id")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed", "declined"]);
  if (assignments.error) {
    throw new Error("Could not load your schedule", { cause: assignments.error.code });
  }
  if (assignments.data.length === 0) {
    return [];
  }
  const [events, roles, departments] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, ends_at, location, cancelled_at")
      .in(
        "id",
        assignments.data.map((a) => a.event_id),
      )
      .gt("ends_at", new Date().toISOString())
      .is("cancelled_at", null),
    supabase
      .from("serving_roles")
      .select("id, name")
      .in(
        "id",
        assignments.data.map((a) => a.role_id),
      ),
    supabase
      .from("departments")
      .select("id, name")
      .in("id", [...new Set(assignments.data.map((a) => a.department_id))]),
  ]);
  if (events.error || roles.error || departments.error) {
    throw new Error("Could not load your schedule", {
      cause: (events.error ?? roles.error ?? departments.error)?.code,
    });
  }
  return assignments.data
    .flatMap((a) => {
      const event = events.data.find((e) => e.id === a.event_id);
      return event
        ? [
            {
              id: a.id,
              status: a.status,
              readiness: a.readiness,
              event: {
                id: event.id,
                title: event.title,
                startsAt: event.starts_at,
                endsAt: event.ends_at,
                location: event.location,
              },
              roleName: roles.data.find((r) => r.id === a.role_id)?.name ?? "A serving role",
              departmentName: departments.data.find((d) => d.id === a.department_id)?.name ?? "",
            },
          ]
        : [];
    })
    .toSorted((a, b) => (a.event.startsAt < b.event.startsAt ? -1 : 1));
}

export type Unavailable = { id: string; startsOn: string; endsOn: string; note: string };

export async function getMyUnavailability(userId: string): Promise<Unavailable[]> {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("unavailability")
    .select("id, starts_on, ends_on, note")
    .eq("user_id", userId)
    .gte("ends_on", today)
    .order("starts_on");
  if (error) {
    throw new Error("Could not load unavailability", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    note: row.note,
  }));
}

export async function respondToAssignment(
  assignmentId: string,
  response: "confirmed" | "declined",
): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("respond_to_assignment", {
    p_assignment_id: assignmentId,
    p_response: response,
  });
  return error ? fail(error) : { ok: true };
}

export async function addUnavailability(input: {
  startsOn: string;
  endsOn: string;
  note: string;
}): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_unavailability", {
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_note: input.note,
  });
  return error ? fail(error) : { ok: true };
}

export async function removeUnavailability(id: string): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_unavailability", { p_id: id });
  return error ? fail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Schedulers
// ---------------------------------------------------------------------------

export type EventSummary = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  cancelled: boolean;
  positions: number;
  filled: number;
};

/** Upcoming events (and today's), with how many positions are filled. */
export async function getUpcomingEvents(): Promise<EventSummary[]> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const events = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, location, cancelled_at")
    .gt("ends_at", since)
    .order("starts_at")
    .limit(100);
  if (events.error) {
    throw new Error("Could not load events", { cause: events.error.code });
  }
  if (events.data.length === 0) {
    return [];
  }
  const ids = events.data.map((e) => e.id);
  const [positions, assignments] = await Promise.all([
    supabase.from("event_positions").select("id, event_id").in("event_id", ids),
    supabase
      .from("event_assignments")
      .select("event_id, position_id")
      .in("event_id", ids)
      .in("status", ["pending", "confirmed"]),
  ]);
  if (positions.error || assignments.error) {
    throw new Error("Could not load events", {
      cause: (positions.error ?? assignments.error)?.code,
    });
  }
  return events.data.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location,
    cancelled: event.cancelled_at !== null,
    positions: positions.data.filter((p) => p.event_id === event.id).length,
    filled: assignments.data.filter((a) => a.event_id === event.id).length,
  }));
}

export type PositionDetail = {
  id: string;
  departmentId: string;
  departmentName: string;
  roleName: string;
  canManage: boolean;
  assignment: {
    id: string;
    userId: string;
    name: string;
    status: AssignmentStatus;
    readiness: AssignmentReadiness;
    supervisorName: string | null;
    overrideReason: string | null;
  } | null;
};

export type EventDetail = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  cancelled: boolean;
  positions: PositionDetail[];
  /** Roles the person may add positions for. */
  roles: { id: string; name: string; departmentName: string }[];
};

export async function getEventDetail(
  eventId: string,
  grants: readonly CapabilityGrant[],
): Promise<EventDetail | null> {
  const supabase = await createSupabaseServerClient();
  const event = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, location, notes, cancelled_at")
    .eq("id", eventId)
    .maybeSingle();
  if (event.error) {
    throw new Error("Could not load the event", { cause: event.error.code });
  }
  if (!event.data) {
    return null;
  }
  const [positions, assignments, departments, roles] = await Promise.all([
    supabase
      .from("event_positions")
      .select("id, department_id, role_id, sort_order")
      .eq("event_id", eventId)
      .order("sort_order"),
    supabase
      .from("event_assignments")
      .select("id, position_id, user_id, status, readiness, supervisor_id, override_reason")
      .eq("event_id", eventId)
      .in("status", ["pending", "confirmed", "declined"])
      .order("assigned_at", { ascending: false }),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
    supabase.from("serving_roles").select("id, department_id, name, archived_at").order("name"),
  ]);
  if (positions.error || assignments.error || departments.error || roles.error) {
    throw new Error("Could not load the event", {
      cause: (positions.error ?? assignments.error ?? departments.error ?? roles.error)?.code,
    });
  }
  const people = await peopleById(supabase, [
    ...assignments.data.map((a) => a.user_id),
    ...assignments.data.flatMap((a) => (a.supervisor_id ? [a.supervisor_id] : [])),
  ]);
  const departmentName = (id: string) => departments.data.find((d) => d.id === id)?.name ?? "";
  return {
    id: event.data.id,
    title: event.data.title,
    startsAt: event.data.starts_at,
    endsAt: event.data.ends_at,
    location: event.data.location,
    notes: event.data.notes,
    cancelled: event.data.cancelled_at !== null,
    positions: positions.data.map((position) => {
      // The newest assignment that still holds the position, or the latest decline.
      const current =
        assignments.data.find(
          (a) =>
            a.position_id === position.id && (a.status === "pending" || a.status === "confirmed"),
        ) ?? assignments.data.find((a) => a.position_id === position.id);
      return {
        id: position.id,
        departmentId: position.department_id,
        departmentName: departmentName(position.department_id),
        roleName: roles.data.find((r) => r.id === position.role_id)?.name ?? "A serving role",
        canManage: hasCapability(grants, "schedule.manage", position.department_id),
        assignment: current
          ? {
              id: current.id,
              userId: current.user_id,
              name: personFor(people, current.user_id).displayName,
              status: current.status,
              readiness: current.readiness,
              supervisorName: current.supervisor_id
                ? personFor(people, current.supervisor_id).displayName
                : null,
              overrideReason: current.override_reason,
            }
          : null,
      };
    }),
    roles: roles.data
      .filter(
        (role) =>
          role.archived_at === null && hasCapability(grants, "schedule.manage", role.department_id),
      )
      .map((role) => ({
        id: role.id,
        name: role.name,
        departmentName: departmentName(role.department_id),
      })),
  };
}

export type Candidate = {
  id: string;
  name: string;
  approved: boolean;
  conflict: boolean;
  unavailable: boolean;
};

export async function getCandidates(positionId: string): Promise<Candidate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("schedule_candidates", { p_position_id: positionId });
  if (error) {
    throw new Error("Could not load candidates", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.user_id,
    name: row.display_name,
    approved: row.approved,
    conflict: row.conflict,
    unavailable: row.unavailable,
  }));
}

export async function createEvent(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
}): Promise<WithValue<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: input.title,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      location: input.location,
      notes: input.notes,
    })
    .select("id")
    .single();
  return error ? fail(error) : { ok: true, value: data.id };
}

export async function cancelEvent(eventId: string): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_event", { p_event_id: eventId });
  return error ? fail(error) : { ok: true };
}

export async function addPosition(eventId: string, roleId: string): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_event_position", {
    p_event_id: eventId,
    p_role_id: roleId,
  });
  return error ? fail(error) : { ok: true };
}

export async function removePosition(positionId: string): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_event_position", { p_position_id: positionId });
  return error ? fail(error) : { ok: true };
}

export async function assignToPosition(input: {
  positionId: string;
  userId: string;
  supervisorId: string | null;
  overrideReason: string | null;
}): Promise<WithValue<AssignmentReadiness>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_to_position", {
    p_position_id: input.positionId,
    p_user_id: input.userId,
    p_supervisor_id: input.supervisorId,
    p_override_reason: input.overrideReason,
  });
  return error ? fail(error) : { ok: true, value: data };
}

export async function cancelAssignment(assignmentId: string): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_assignment", { p_assignment_id: assignmentId });
  return error ? fail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Calendars (decision record 9, stage 1)
// ---------------------------------------------------------------------------

/** The volunteer's assignments (not cancelled) for services starting in a UTC range. */
export async function getMyAssignmentsBetween(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<MyAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const events = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, location")
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .is("cancelled_at", null);
  if (events.error) {
    throw new Error("Could not load your calendar", { cause: events.error.code });
  }
  if (events.data.length === 0) {
    return [];
  }
  const assignments = await supabase
    .from("event_assignments")
    .select("id, status, readiness, event_id, role_id, department_id")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed", "declined"])
    .in(
      "event_id",
      events.data.map((e) => e.id),
    );
  if (assignments.error) {
    throw new Error("Could not load your calendar", { cause: assignments.error.code });
  }
  const [roles, departments] = await Promise.all([
    supabase
      .from("serving_roles")
      .select("id, name")
      .in(
        "id",
        assignments.data.map((a) => a.role_id),
      ),
    supabase
      .from("departments")
      .select("id, name")
      .in("id", [...new Set(assignments.data.map((a) => a.department_id))]),
  ]);
  if (roles.error || departments.error) {
    throw new Error("Could not load your calendar", {
      cause: (roles.error ?? departments.error)?.code,
    });
  }
  return assignments.data
    .flatMap((a) => {
      const event = events.data.find((e) => e.id === a.event_id);
      return event
        ? [
            {
              id: a.id,
              status: a.status,
              readiness: a.readiness,
              event: {
                id: event.id,
                title: event.title,
                startsAt: event.starts_at,
                endsAt: event.ends_at,
                location: event.location,
              },
              roleName: roles.data.find((r) => r.id === a.role_id)?.name ?? "A serving role",
              departmentName: departments.data.find((d) => d.id === a.department_id)?.name ?? "",
            },
          ]
        : [];
    })
    .toSorted((a, b) => (a.event.startsAt < b.event.startsAt ? -1 : 1));
}

export type TeamSlot = {
  positionId: string;
  roleName: string;
  departmentName: string;
  userId: string | null;
  name: string | null;
  status: AssignmentStatus | null;
};

/** Everyone serving at a service: for the people scheduled at it, and its schedulers. */
export async function getEventTeam(eventId: string): Promise<TeamSlot[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("event_team", { p_event_id: eventId });
  if (error) {
    if (error.code === "42501") {
      return [];
    }
    throw new Error("Could not load the team", { cause: error.code });
  }
  return data.map((row) => ({
    positionId: row.position_id,
    roleName: row.role_name,
    departmentName: row.department_name,
    userId: row.user_id,
    name: row.display_name,
    status: row.status,
  }));
}

/** Services starting in a UTC range, with how many positions are filled, for the scheduler. */
export async function getEventsBetween(fromIso: string, toIso: string): Promise<EventSummary[]> {
  const supabase = await createSupabaseServerClient();
  const events = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, location, cancelled_at")
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at")
    .limit(200);
  if (events.error) {
    throw new Error("Could not load events", { cause: events.error.code });
  }
  if (events.data.length === 0) {
    return [];
  }
  const ids = events.data.map((e) => e.id);
  const [positions, assignments] = await Promise.all([
    supabase.from("event_positions").select("id, event_id").in("event_id", ids),
    supabase
      .from("event_assignments")
      .select("event_id, position_id")
      .in("event_id", ids)
      .in("status", ["pending", "confirmed"]),
  ]);
  if (positions.error || assignments.error) {
    throw new Error("Could not load events", {
      cause: (positions.error ?? assignments.error)?.code,
    });
  }
  return events.data.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location,
    cancelled: event.cancelled_at !== null,
    positions: positions.data.filter((p) => p.event_id === event.id).length,
    filled: assignments.data.filter((a) => a.event_id === event.id).length,
  }));
}
