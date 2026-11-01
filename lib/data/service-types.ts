import "server-only";
import { peopleById, personFor } from "@/lib/data/admin/shared";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  toServiceTypeError,
  type MatrixService,
  type ServiceTypeError,
  type ServiceTypeInput,
} from "@/lib/domain/service-types";

// Service types and the Matrix (decision record 9, stage 1). The database checks schedule.manage.

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: ServiceTypeError };

export type ServiceType = {
  id: string;
  name: string;
  startTime: string;
  durationMinutes: number;
  location: string;
  notes: string;
  allowSignups: boolean;
  positions: { roleId: string; roleName: string; departmentName: string }[];
};

export async function listServiceTypes(): Promise<ServiceType[]> {
  const supabase = await createSupabaseServerClient();
  const [types, positions, roles, departments] = await Promise.all([
    supabase
      .from("service_types")
      .select("id, name, start_time, duration_minutes, location, notes, allow_signups")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("service_type_positions")
      .select("service_type_id, role_id, department_id, sort_order")
      .order("sort_order"),
    supabase.from("serving_roles").select("id, name"),
    supabase.from("departments").select("id, name"),
  ]);
  if (types.error || positions.error || roles.error || departments.error) {
    throw new Error("Could not load service types", {
      cause: (types.error ?? positions.error ?? roles.error ?? departments.error)?.code,
    });
  }
  return types.data.map((type) => ({
    id: type.id,
    name: type.name,
    startTime: type.start_time.slice(0, 5),
    durationMinutes: type.duration_minutes,
    location: type.location,
    notes: type.notes,
    allowSignups: type.allow_signups,
    positions: positions.data
      .filter((p) => p.service_type_id === type.id)
      .map((p) => ({
        roleId: p.role_id,
        roleName: roles.data.find((r) => r.id === p.role_id)?.name ?? "A position",
        departmentName: departments.data.find((d) => d.id === p.department_id)?.name ?? "",
      })),
  }));
}

export async function getServiceType(id: string): Promise<ServiceType | null> {
  return (await listServiceTypes()).find((type) => type.id === id) ?? null;
}

export async function saveServiceType(
  id: string | null,
  input: ServiceTypeInput,
): Promise<Result<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_service_type", {
    p_id: id,
    p_name: input.name,
    p_start_time: input.startTime,
    p_duration_minutes: input.durationMinutes,
    p_location: input.location,
    p_notes: input.notes,
  });
  return error ? { ok: false, error: toServiceTypeError(error) } : { ok: true, value: data };
}

export async function setServiceTypeSignups(id: string, open: boolean): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_service_type_signups", { p_id: id, p_open: open });
  return error ? { ok: false, error: toServiceTypeError(error) } : { ok: true, value: undefined };
}

export async function archiveServiceType(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_service_type", { p_id: id });
  return error ? { ok: false, error: toServiceTypeError(error) } : { ok: true, value: undefined };
}

export async function setServiceTypePositions(id: string, roleIds: string[]): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_service_type_positions", {
    p_id: id,
    p_role_ids: roleIds,
  });
  return error ? { ok: false, error: toServiceTypeError(error) } : { ok: true, value: undefined };
}

export async function createServices(id: string, dates: string[]): Promise<Result<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_services", {
    p_service_type_id: id,
    p_dates: dates,
  });
  return error ? { ok: false, error: toServiceTypeError(error) } : { ok: true, value: data };
}

/** The next services of a type, with each position and who's in it, for the Matrix. */
export async function getMatrixServices(typeId: string, limit = 8): Promise<MatrixService[]> {
  const supabase = await createSupabaseServerClient();
  const events = await supabase
    .from("events")
    .select("id, starts_at")
    .eq("service_type_id", typeId)
    .is("cancelled_at", null)
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(limit);
  if (events.error) {
    throw new Error("Could not load services", { cause: events.error.code });
  }
  if (events.data.length === 0) {
    return [];
  }
  const ids = events.data.map((e) => e.id);
  const [positions, assignments, roles, departments] = await Promise.all([
    supabase
      .from("event_positions")
      .select("id, event_id, role_id, department_id, sort_order")
      .in("event_id", ids),
    supabase
      .from("event_assignments")
      .select("position_id, user_id, status")
      .in("event_id", ids)
      .in("status", ["pending", "confirmed"]),
    supabase.from("serving_roles").select("id, name"),
    supabase.from("departments").select("id, name"),
  ]);
  if (positions.error || assignments.error || roles.error || departments.error) {
    throw new Error("Could not load the matrix", {
      cause: (positions.error ?? assignments.error ?? roles.error ?? departments.error)?.code,
    });
  }
  const people = await peopleById(
    supabase,
    assignments.data.map((a) => a.user_id),
  );
  return events.data.map((event) => ({
    id: event.id,
    startsAt: event.starts_at,
    positions: positions.data
      .filter((p) => p.event_id === event.id)
      .map((p) => {
        const assignment = assignments.data.find((a) => a.position_id === p.id);
        return {
          id: p.id,
          roleId: p.role_id,
          roleName: roles.data.find((r) => r.id === p.role_id)?.name ?? "A position",
          departmentName: departments.data.find((d) => d.id === p.department_id)?.name ?? "",
          sortOrder: p.sort_order,
          person: assignment
            ? { name: personFor(people, assignment.user_id).displayName, status: assignment.status }
            : null,
        };
      }),
  }));
}

/** Positions this person may add to a service type: roles in departments they schedule. */
export async function getSchedulableRoles(
  grants: readonly CapabilityGrant[],
): Promise<{ id: string; name: string; departmentName: string }[]> {
  const supabase = await createSupabaseServerClient();
  const [roles, departments] = await Promise.all([
    supabase.from("serving_roles").select("id, name, department_id").is("archived_at", null),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
  ]);
  if (roles.error || departments.error) {
    throw new Error("Could not load positions", {
      cause: (roles.error ?? departments.error)?.code,
    });
  }
  return departments.data.flatMap((department) =>
    roles.data
      .filter(
        (role) =>
          role.department_id === department.id &&
          hasCapability(grants, "schedule.manage", department.id),
      )
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((role) => ({ id: role.id, name: role.name, departmentName: department.name })),
  );
}
